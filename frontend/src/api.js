const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : {};

  if (!response.ok) {
    const errorParts = [data.error, data.details].filter(Boolean);
    const message = errorParts.length ? errorParts.join(": ") : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export const api = {
  baseUrl: API_BASE_URL,
  getMe: () => request("/me"),
  getValidationRules: () => request("/validation-rules"),
  stageToggle: (payload) =>
    request("/toggle-rule", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deploy: () =>
    request("/deploy", {
      method: "POST"
    }),
  logout: () =>
    request("/logout", {
      method: "POST"
    })
};
