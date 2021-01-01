const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN});

const POCKET_APP_CONSUMER_KEY = process.env.POCKET_APP_CONSUMER_KEY;
const SECRET_KEY = process.env.SECRET_KEY;

/**
 * Client is redirected here after a successful Pocket login.
 * Use the validated request token to obtain an access token, and store it under
 * key "pocket-access-token".
 * 
 * Reference:
 * https://getpocket.com/developer/docs/authentication
 * 
 * @returns {object} success
 */
module.exports = async (context) => {
  const secret = context.params['secret'];
  if (secret !== SECRET_KEY) {
    throw new Error(`Secret incorrect.`);
  }
  
  const requestToken = await lib.utils.kv['@0.1.16'].get({
    key: `pocket-request-token`
  });
  await lib.utils.kv['@0.1.16'].clear({
    key: `pocket-access-token`
  });
  
  const authorizeResponse = await lib.http.request['@1.1.5'].post({
    url: `https://getpocket.com/v3/oauth/authorize`,
    headers: {
      'X-Accept': `application/json`
    },
    params: {
      'consumer_key': POCKET_APP_CONSUMER_KEY,
      'code': requestToken
    }
  });
  if (authorizeResponse.statusCode !== 200) {
    console.error(authorizeResponse);
    throw new Error(`Failed to obtain access token from Pocket.`);
  }

  const accessToken = authorizeResponse.data['access_token'];
  const username = authorizeResponse.data['username'];
  
  await lib.utils.kv['@0.1.16'].set({
    key: `pocket-access-token`,
    value: `${accessToken}`
  });
  
  return {
    username,
    accessToken
  };
};