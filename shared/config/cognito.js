// Cognito Configuration for Panda CRM
// These values should be set via environment variables in production

export const cognitoConfig = {
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-2_e02zbxuZ2',
  clientId: process.env.COGNITO_CLIENT_ID || '3lbnfdmlicub1u6k13tbpil80a',
  clientSecret: process.env.COGNITO_CLIENT_SECRET,
  region: process.env.AWS_REGION || 'us-east-2',
  domain: 'panda-crm-auth',

  // Token settings
  accessTokenExpiry: 3600, // 1 hour in seconds
  idTokenExpiry: 3600,
  refreshTokenExpiry: 2592000, // 30 days in seconds

  // URLs
  get hostedUiUrl() {
    return `https://${this.domain}.auth.${this.region}.amazoncognito.com`;
  },

  get tokenUrl() {
    return `${this.hostedUiUrl}/oauth2/token`;
  },

  get authorizeUrl() {
    return `${this.hostedUiUrl}/oauth2/authorize`;
  },

  get userInfoUrl() {
    return `${this.hostedUiUrl}/oauth2/userInfo`;
  },

  get logoutUrl() {
    return `${this.hostedUiUrl}/logout`;
  },

  get jwksUrl() {
    return `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`;
  },
};

export default cognitoConfig;
