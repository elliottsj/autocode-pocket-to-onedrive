const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN});

const CLIENT_ID = process.env.ONEDRIVE_APP_CLIENT_ID;
const CLIENT_SECRET = process.env.ONEDRIVE_APP_CLIENT_SECRET;
const REDIRECT_URI = process.env.ONEDRIVE_AUTH_CALLBACK_ENDPOINT;

/**
 * Refresh the OneDrive token every hour.
 * 
 * Reference:
 * https://docs.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/graph-oauth?view=odsp-graph-online
 * 
 * @returns {object} result
 */
module.exports = async () => {
  const refreshToken = await lib.utils.kv['@0.1.16'].get({
    key: `onedrive-refresh-token`
  });
  
  if (!refreshToken) {
    console.warn(`No refresh token found.`);
    return {
      message: 'No refresh token found.'
    };
  }
  
  const refreshResponse = await lib.http.request['@1.1.5']({
    method: 'POST',
    url: `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
    headers: {
      'Content-Type': `application/x-www-form-urlencoded`,
      'Accept': `application/json`
    },
    body:
      `grant_type=refresh_token&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&refresh_token=${refreshToken}`
  });
  
  if (refreshResponse.statusCode !== 200) {
    console.log(refreshResponse);
    throw new Error(`Failed to obtain access token from OneDrive.`);
  }
  
  const {
    expires_in: accessTokenExpiresInSeconds,
    access_token: accessToken,
    refresh_token: newRefreshToken
  } = JSON.parse(refreshResponse.body.toString());
  
  console.log(`accessTokenExpiresInSeconds`, accessTokenExpiresInSeconds);
  console.log(`accessToken`, accessToken);
  console.log(`newRefreshToken`, newRefreshToken);
  
  await lib.utils.kv['@0.1.16'].set({
    key: `onedrive-access-token`,
    value: accessToken,
    ttl: accessTokenExpiresInSeconds
  });
  await lib.utils.kv['@0.1.16'].set({
    key: `onedrive-refresh-token`,
    value: newRefreshToken
  });
  
  return {
    refreshToken,
    accessTokenExpiresInSeconds,
    accessToken,
    newRefreshToken
  };
};