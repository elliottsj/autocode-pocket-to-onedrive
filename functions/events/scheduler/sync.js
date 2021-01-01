const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN});

const dateFns = require('date-fns');
const _ = require('lodash');

const POCKET_LOGIN_ENDPOINT = process.env.POCKET_LOGIN_ENDPOINT;
const ONEDRIVE_AUTH_CALLBACK_ENDPOINT = process.env.ONEDRIVE_AUTH_CALLBACK_ENDPOINT;
const ONEDRIVE_APP_CLIENT_ID = process.env.ONEDRIVE_APP_CLIENT_ID;
const POCKET_APP_CONSUMER_KEY = process.env.POCKET_APP_CONSUMER_KEY;
const ONEDRIVE_FILE_PATH = process.env.ONEDRIVE_FILE_PATH;
const SECRET_KEY = process.env.SECRET_KEY;

/**
 * Return an ISO-8601 date string in UTC time.
 * 
 * @example
 *   > // Local time zone: UTC-05:00
 *   > formatDateIsoUtc(new Date(2021, 0, 1, 12, 24, 48))
 *   "2021-01-01"
 *   > formatDateIsoUtc(new Date(2020, 11, 31, 21, 24, 48))
 *   "2021-01-01"
 */
function formatDateIsoUtc(date) {
  return dateFns.formatISO(
    dateFns.addMinutes(date, date.getTimezoneOffset()),
    { representation: 'date' }
  );
}

/**
* Periodically check the latest Pocket items and append new items 
* to a Markdown file in OneDrive.
* 
* @returns {object} result
*/
module.exports = async () => {
  const pocketAccessToken = await lib.utils.kv['@0.1.16'].get({
    key: `pocket-access-token`
  });
  const onedriveAccessToken = await lib.utils.kv['@0.1.16'].get({
    key: `onedrive-access-token`
  });
  
  if (!pocketAccessToken) {
    const pocketLoginUrl = `${POCKET_LOGIN_ENDPOINT}?secret=${SECRET_KEY}`;
    await lib.utils.sms['@2.0.2']({
      to: process.env.PHONE_NUMBER,
      body: `Pocket access token expired. Log in at ${pocketLoginUrl}`
    });
    return { message: 'Pocket access token expired. Sent login prompt via SMS.' };
  }
  if (!onedriveAccessToken) {
    const onedriveLoginUrl = new URL(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize`);
    onedriveLoginUrl.searchParams.append('client_id', ONEDRIVE_APP_CLIENT_ID);
    onedriveLoginUrl.searchParams.append('scope', 'files.readwrite offline_access');
    onedriveLoginUrl.searchParams.append('response_type', 'code');
    onedriveLoginUrl.searchParams.append('redirect_uri', ONEDRIVE_AUTH_CALLBACK_ENDPOINT);
    await lib.utils.sms['@2.0.2']({
      to: process.env.PHONE_NUMBER,
      body: `OneDrive access token expired. Log in at ${onedriveLoginUrl.href}`
    });
    return { message: 'OneDrive access token expired. Sent login prompt via SMS.' };
  }
  
  console.log(`Using Pocket access token: ${pocketAccessToken}`);
  console.log(`Using OneDrive access token: ${onedriveAccessToken}`);
  
  // Get items from Pocket newer than 24 hours old
  const pocketItemsResponse = await lib.http.request['@1.1.5'].get({
    url: `https://getpocket.com/v3/get`,
    queryParams: {
      'consumer_key': POCKET_APP_CONSUMER_KEY,
      'access_token': pocketAccessToken,
      'state': 'all',
      'sort': 'newest',
      'detailType': 'simple',
      // 1 day ago, as Unix epoch seconds
      'since': dateFns.getUnixTime(dateFns.subDays(new Date(), 1))
    }
  });
  
  if (pocketItemsResponse.statusCode !== 200) {
    console.error(pocketItemsResponse);
    throw new Error(`Failed to fetch items from Pocket.`);
  }
  
  // Find Pocket items which have not been seen recently.
  // Two key-value pairs are persisted and expire automatically after 48 hours:
  // yesterday's seen items and today's seen items.
  // If a Pocket item is found in neither array, then it is considered new.
  // If a key-value pair does not exist for today, then a new one is created.
  
  const pocketItems = Object.values(pocketItemsResponse.data['list']);
  const yesterdaysDate = formatDateIsoUtc(dateFns.addDays(new Date(), 1));
  const todaysDate = formatDateIsoUtc(new Date());
  
  const yesterdaySeenUrls = await lib.utils.kv['@0.1.16'].get({
    key: `pocket-urls-${yesterdaysDate}`,
    defaultValue: `[]`
  });
  const todaySeenUrls = await lib.utils.kv['@0.1.16'].get({
    key: `pocket-urls-${todaysDate}`,
    defaultValue: `[]`
  });
  
  const newItems = pocketItems.filter((item) => {
    const seenYesterday = yesterdaySeenUrls.includes(item['resolved_url']);
    const seenToday = todaySeenUrls.includes(item['resolved_url']);
    
    return !seenYesterday && !seenToday;
  });
  const newUrls = newItems.map((item) => item['resolved_url']).filter(Boolean);
  
  console.log(`Found new URLs:`);
  console.log(newUrls);
  
  // Persist new URLs so they are ignored in the future.
  await lib.utils.kv['@0.1.16'].set({
    key: `pocket-urls-${todaysDate}`,
    value: [...todaySeenUrls, ...newUrls],
    ttl: 48 * 60 * 60 // 48 hours in seconds
  });
  
  // Stop if there aren't any new URLs
  if (newUrls.length === 0) {
    return { newUrls };
  }
  
  // Fetch existing file content from OneDrive
  const driveItemResponse = await lib.http.request['@1.1.5'].get({
    url: `https://graph.microsoft.com/v1.0/me/drive/root:${ONEDRIVE_FILE_PATH}`,
    authorization: `Bearer ${onedriveAccessToken}`
  });
  if (driveItemResponse.statusCode !== 200) {
    console.error(driveItemResponse);
    throw new Error(`Failed to fetch drive item from OneDrive.`);
  }
  const fileContentResponse = await lib.http.request['@1.1.5']({
    method: 'GET',
    url: driveItemResponse.data['@microsoft.graph.downloadUrl']
  });
  
  // Append new lines to the existing content
  const newLines = newUrls.map((newUrl) => `- [ ] ${newUrl}\n`).join('');
  const newFileContent = Buffer.concat([
    fileContentResponse.body,
    Buffer.from(newLines)
  ]);
  const uploadResponse = await lib.http.request['@1.1.5']({
    method: 'PUT',
    url: `https://graph.microsoft.com/v1.0/me/drive/root:${ONEDRIVE_FILE_PATH}:/content`,
    headers: {
      'Authorization': `Bearer ${onedriveAccessToken}`
    },
    body: newFileContent.toString()
  });
  if (uploadResponse.statusCode !== 200) {
    console.error(uploadResponse);
    throw new Error(`Failed to upload.`);
  }
  
  return { newUrls };
};