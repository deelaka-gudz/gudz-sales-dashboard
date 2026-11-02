// Gatsby only inlines static process.env.X references, so they are read here.
export function readCredentials() {
  return {
    accounts: {
      UK: {
        applicationId: process.env.GATSBY_CA_UK_APPLICATION_ID,
        sharedSecret: process.env.GATSBY_CA_UK_SHARED_SECRET,
        refreshToken: process.env.GATSBY_CA_UK_REFRESH_TOKEN,
        profileId: process.env.GATSBY_CA_UK_PROFILE_ID,
      },
      IRE: {
        applicationId: process.env.GATSBY_CA_IRE_APPLICATION_ID,
        sharedSecret: process.env.GATSBY_CA_IRE_SHARED_SECRET,
        refreshToken: process.env.GATSBY_CA_IRE_REFRESH_TOKEN,
        profileId: process.env.GATSBY_CA_IRE_PROFILE_ID,
      },
    },
    helm: {
      baseUrl: process.env.GATSBY_HELM_BASE_URL,
      email: process.env.GATSBY_HELM_EMAIL,
      password: process.env.GATSBY_HELM_PASSWORD,
    },
    mirakl: {
      tesco: {
        apiKey: process.env.GATSBY_MIRAKL_TESCO_API_KEY,
        baseUrl: process.env.GATSBY_MIRAKL_TESCO_BASE_URL,
      },
      superdrug: {
        apiKey: process.env.GATSBY_MIRAKL_SUPERDRUG_API_KEY,
        baseUrl: process.env.GATSBY_MIRAKL_SUPERDRUG_BASE_URL,
      },
    },
  };
}

export const hasHelmCredentials = ({ helm }) =>
  Boolean(helm.baseUrl && helm.email && helm.password);
