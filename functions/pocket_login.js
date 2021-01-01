const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN});

const POCKET_AUTH_CALLBACK_ENDPOINT = process.env.POCKET_AUTH_CALLBACK_ENDPOINT;
const POCKET_APP_CONSUMER_KEY = process.env.POCKET_APP_CONSUMER_KEY;
const SECRET_KEY = process.env.SECRET_KEY;

/**
 * Redirect the client making this request to the Pocket login page,
 * using the "Pocket to OneDrive via Autocode" app key.
 * 
 * After logging in, the request token becomes valid and the client is directed
 * to the `pocket_auth_callback` handler to retrieve and store the access token.
 * 
 * @returns {object.http} redirect Redirect to Pocket
 */
module.exports = async (context) => {
  const secret = context.params['secret'];
  if (secret !== SECRET_KEY) {
    throw new Error(`Secret incorrect.`);
  }
  
  const redirectUri = `${POCKET_AUTH_CALLBACK_ENDPOINT}?secret=${SECRET_KEY}`;
  
  const requestTokenResponse = await lib.http.request['@1.1.5'].post({
    url: `https://getpocket.com/v3/oauth/request`,
    headers: {
      'X-Accept': `application/json`
    },
    params: {
      'consumer_key': POCKET_APP_CONSUMER_KEY,
      'redirect_uri': redirectUri
    }
  });
  if (requestTokenResponse.statusCode !== 200) {
    console.error(requestTokenResponse);
    throw new Error(`Failed to retrieve request token from Pocket API.`);
  }
  
  const requestToken = requestTokenResponse.data['code'];
  const pocketLoginPageUri = 
    `https://getpocket.com/auth/authorize?request_token=${requestToken}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  await lib.utils.kv['@0.1.16'].set({
    key: `pocket-request-token`,
    value: requestToken,
    ttl: 60
  });

  return {
    headers: {
      Location: pocketLoginPageUri
    },
    statusCode: 303,
    body: Buffer.from('')
  };
};