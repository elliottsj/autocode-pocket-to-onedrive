const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN});

const CLIENT_ID = process.env.ONEDRIVE_APP_CLIENT_ID;
const CLIENT_SECRET = process.env.ONEDRIVE_APP_CLIENT_SECRET;
const REDIRECT_URI = process.env.ONEDRIVE_AUTH_CALLBACK_ENDPOINT;

/**
 * Client is redirected here after a successful OneDrive login.
 * Use the authorization code to obtain an access token, and store it under
 * key "onedrive-access-token". The refresh token is stored under key 
 * "onedrive-refresh-token".
 * 
 * Reference:
 * https://docs.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/graph-oauth?view=odsp-graph-online
 * 
 * @returns {object} result
 */
module.exports = async (context) => {
  const code = context.params['code'];
  
  if (!code) {
    throw new Error('Missing `?code` param.');
  }
  
  console.log(`Using authorization code "${code}".`);
  
  const authorizeResponse = await lib.http.request['@1.1.5']({
    method: 'POST',
    url: `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
    headers: {
      'Content-Type': `application/x-www-form-urlencoded`,
      'Accept': `application/json`
    },
    body:
      `grant_type=authorization_code&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`
  });
  
  if (authorizeResponse.statusCode !== 200) {
    console.log(authorizeResponse);
    throw new Error(`Failed to obtain access token from OneDrive.`);
  }
  
  const {
    expires_in: accessTokenExpiresInSeconds,
    access_token: accessToken,
    refresh_token: refreshToken
  } = JSON.parse(authorizeResponse.body.toString());
  
  console.log(`accessTokenExpiresInSeconds`, accessTokenExpiresInSeconds);
  console.log(`accessToken`, accessToken);
  console.log(`refreshToken`, refreshToken);
  
  await lib.utils.kv['@0.1.16'].set({
    key: `onedrive-access-token`,
    value: accessToken,
    ttl: accessTokenExpiresInSeconds
  });
  await lib.utils.kv['@0.1.16'].set({
    key: `onedrive-refresh-token`,
    value: refreshToken
  });
  
  return {
    code,
    accessTokenExpiresInSeconds,
    accessToken,
    refreshToken
  };
};