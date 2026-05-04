import express from "express";
import session from "express-session";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import jsforce from "jsforce";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: false });

const app = express();

const {
  PORT = "5000",
  FRONTEND_URL = "http://localhost:5173",
  SESSION_SECRET,
  SALESFORCE_CLIENT_ID,
  SALESFORCE_CLIENT_SECRET,
  SALESFORCE_CALLBACK_URL,
  SALESFORCE_REDIRECT_URI,
  SALESFORCE_LOGIN_URL = "https://login.salesforce.com",
  SALESFORCE_API_VERSION = "v61.0"
} = process.env;

const resolvedSalesforceClientId = SALESFORCE_CLIENT_ID || process.env.SF_CLIENT_ID;
const resolvedSalesforceClientSecret = SALESFORCE_CLIENT_SECRET || process.env.SF_CLIENT_SECRET;
const resolvedSalesforceRedirectUri =
  SALESFORCE_CALLBACK_URL || SALESFORCE_REDIRECT_URI || process.env.SF_CALLBACK_URL || process.env.SF_REDIRECT_URI;
const resolvedSalesforceLoginUrl = SALESFORCE_LOGIN_URL || process.env.SF_LOGIN_URL || "https://login.salesforce.com";
const resolvedSalesforceApiVersion = SALESFORCE_API_VERSION || process.env.SF_API_VERSION || "v61.0";

function hasRealOAuthConfig() {
  const values = [resolvedSalesforceClientId, resolvedSalesforceClientSecret, resolvedSalesforceRedirectUri];
  if (values.some((value) => !value)) return false;
  return !values.some((value) => String(value).includes("YOUR_CONNECTED_APP"));
}

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET || "local-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

function requireAuth(req, res, next) {
  if (!req.session.salesforce?.accessToken) {
    return res.status(401).json({ error: "Not authenticated with Salesforce" });
  }
  return next();
}

function getConnection(req) {
  const sf = req.session.salesforce;
  return new jsforce.Connection({
    instanceUrl: sf.instanceUrl,
    accessToken: sf.accessToken,
    refreshToken: sf.refreshToken,
    oauth2: {
      loginUrl: resolvedSalesforceLoginUrl,
      clientId: resolvedSalesforceClientId,
      clientSecret: resolvedSalesforceClientSecret,
      redirectUri: resolvedSalesforceRedirectUri
    },
    version: resolvedSalesforceApiVersion.replace("v", "")
  });
}

function toBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair() {
  const verifier = toBase64Url(crypto.randomBytes(64));
  const challenge = toBase64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

app.get("/auth/salesforce", (req, res) => {
  try {
    if (!hasRealOAuthConfig()) {
      return res.status(500).json({
        error: "Salesforce OAuth is not configured",
        details:
          "Set real values for SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, SALESFORCE_CALLBACK_URL in backend/.env (or compatible SF_* names)."
      });
    }
    const oauth2 = new jsforce.OAuth2({
      loginUrl: resolvedSalesforceLoginUrl,
      clientId: resolvedSalesforceClientId,
      clientSecret: resolvedSalesforceClientSecret,
      redirectUri: resolvedSalesforceRedirectUri
    });
    const pkce = createPkcePair();
    const state = crypto.randomBytes(16).toString("hex");
    req.session.oauth = {
      state,
      codeVerifier: pkce.verifier
    };
    const authUrl = oauth2.getAuthorizationUrl({
      scope: "api refresh_token offline_access",
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256"
    });
    return res.redirect(authUrl);
  } catch (error) {
    return res.status(500).json({ error: "Failed to initialize OAuth flow", details: error.message });
  }
});

app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: "Missing OAuth code" });
  if (!state || !req.session.oauth?.state || state !== req.session.oauth.state) {
    return res.status(400).json({ error: "Invalid OAuth state" });
  }
  if (!req.session.oauth?.codeVerifier) {
    return res.status(400).json({ error: "Missing PKCE verifier in session. Start login again." });
  }

  try {
    const conn = new jsforce.Connection({
      oauth2: {
        loginUrl: resolvedSalesforceLoginUrl,
        clientId: resolvedSalesforceClientId,
        clientSecret: resolvedSalesforceClientSecret,
        redirectUri: resolvedSalesforceRedirectUri
      }
    });

    const userInfo = await conn.authorize(code, { code_verifier: req.session.oauth.codeVerifier });
    req.session.salesforce = {
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      instanceUrl: conn.instanceUrl,
      userInfo
    };
    delete req.session.oauth;

    return res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    return res.status(500).json({ error: "Salesforce OAuth callback failed", details: error.message });
  }
});

app.get("/me", requireAuth, async (req, res) => {
  try {
    const conn = getConnection(req);
    const identity = await conn.identity();
    return res.json({
      username: identity.username,
      displayName: identity.display_name,
      organizationId: identity.organization_id,
      userId: identity.user_id,
      instanceUrl: req.session.salesforce.instanceUrl
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch user info", details: error.message });
  }
});

app.get("/validation-rules", requireAuth, async (req, res) => {
  try {
    const conn = getConnection(req);
    // Tooling API ValidationRule list queries are restrictive for some fields.
    // Fetch base fields in one query, then load formula from Metadata per rule.
    const listSoql =
      "SELECT Id, ValidationName, Active, Description, ErrorDisplayField, ErrorMessage, EntityDefinition.DeveloperName FROM ValidationRule WHERE EntityDefinition.DeveloperName = 'Account' ORDER BY ValidationName";
    const result = await conn.tooling.query(listSoql);

    const baseRecords = result.records || [];
    const records = [];
    for (const record of baseRecords) {
      let errorConditionFormula = "";
      try {
        const detailSoql = `SELECT Metadata FROM ValidationRule WHERE Id = '${record.Id}'`;
        const detailResult = await conn.tooling.query(detailSoql);
        errorConditionFormula = detailResult.records?.[0]?.Metadata?.errorConditionFormula || "";
      } catch (detailError) {
        // Keep list endpoint resilient even if a formula detail query fails.
        console.warn(`Formula lookup failed for rule ${record.Id}: ${detailError.message}`);
      }

      records.push({
        id: record.Id,
        validationName: record.ValidationName,
        active: Boolean(record.Active),
        description: record.Description || "",
        errorConditionFormula,
        errorDisplayField: record.ErrorDisplayField || "",
        errorMessage: record.ErrorMessage || "",
        objectApiName: record.EntityDefinition?.DeveloperName || "Account"
      });
    }

    req.session.pendingChanges = [];
    return res.json({ totalSize: records.length, records });
  } catch (error) {
    console.error("Validation rule fetch failed:", error);
    return res.status(500).json({ error: "Failed to fetch validation rules", details: error.message });
  }
});

app.post("/toggle-rule", requireAuth, (req, res) => {
  try {
    const {
      id,
      active,
      validationName,
      description,
      objectApiName,
      errorConditionFormula,
      errorDisplayField,
      errorMessage
    } = req.body;

    if (!id || typeof active !== "boolean" || !validationName) {
      return res.status(400).json({ error: "id, validationName, and active(boolean) are required" });
    }

    const pending = Array.isArray(req.session.pendingChanges) ? req.session.pendingChanges : [];
    const nextChange = {
      id,
      active,
      validationName,
      description: description || "",
      objectApiName: objectApiName || "Account",
      errorConditionFormula: errorConditionFormula || "false",
      errorDisplayField: errorDisplayField || "",
      errorMessage: errorMessage || "Validation rule enforced"
    };

    const index = pending.findIndex((item) => item.id === id);
    if (index === -1) pending.push(nextChange);
    else pending[index] = nextChange;

    req.session.pendingChanges = pending;
    return res.json({ message: "Rule change staged", pendingCount: pending.length, pendingChanges: pending });
  } catch (error) {
    return res.status(500).json({ error: "Failed to stage rule toggle", details: error.message });
  }
});

app.post("/deploy", requireAuth, async (req, res) => {
  try {
    const conn = getConnection(req);
    const pending = Array.isArray(req.session.pendingChanges) ? req.session.pendingChanges : [];
    if (!pending.length) {
      return res.status(400).json({ error: "No pending rule changes to deploy" });
    }

    const metadataPayload = pending.map((rule) => ({
      fullName: `${rule.objectApiName}.${rule.validationName}`,
      active: rule.active,
      description: rule.description,
      errorConditionFormula: rule.errorConditionFormula || "false",
      errorMessage: rule.errorMessage || "Validation rule enforced",
      errorDisplayField: rule.errorDisplayField || undefined
    }));

    const rawResult = await conn.metadata.update("ValidationRule", metadataPayload);
    const results = Array.isArray(rawResult) ? rawResult : [rawResult];
    const failed = results.filter((item) => item?.success === false);
    if (failed.length) {
      return res.status(500).json({ error: "Some rule deployments failed", results });
    }

    req.session.pendingChanges = [];
    return res.json({ message: "Validation rule changes deployed via Metadata API", results });
  } catch (error) {
    return res.status(500).json({ error: "Deploy failed", details: error.message });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const port = Number(PORT);
const server = app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the existing process or change PORT in backend/.env.`);
    process.exit(1);
  }
  console.error("Backend failed to start:", error);
  process.exit(1);
});
