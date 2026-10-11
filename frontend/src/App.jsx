
// ============================================================
// LENDLY - MAIN REACT APPLICATION
// Includes authentication and all main student-facing UI.
// API calls connect to the existing Express backend.
// ============================================================

import { useEffect, useState } from "react";
import "./App.css";

// ------------------------------------------------------------
// API HELPER
// Sends requests to Express and returns JSON responses.
// ------------------------------------------------------------
async function apiRequest(endpoint, options = {}) {
  const { token, method = "GET", body } = options;

  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}${endpoint}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }
    );
  } catch {
    throw new Error(
      "Cannot reach Lendly. Check that the backend is running on port 5000."
    );
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    // An empty response is handled by the standard error below.
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status}).`);
  }

  return data;
}

// ------------------------------------------------------------
// SHARED CONSTANTS AND HELPERS
// ------------------------------------------------------------

const EMAIL_PATTERN =
  /^[A-Za-z][A-Za-z0-9_-]*\.\d{2}[A-Za-z]{2,}@kongu\.edu$/;

const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const CATEGORIES = [
  "books",
  "calculators",
  "electronics",
  "lab-equipment",
  "sports",
  "stationery",
  "other",
];

const CATEGORY_NAMES = {
  books: "Books",
  calculators: "Calculators",
  electronics: "Electronics",
  "lab-equipment": "Lab equipment",
  sports: "Sports",
  stationery: "Stationery",
  other: "Other",
};

const CATEGORY_EMOJI = {
  books: "📚",
  calculators: "🧮",
  electronics: "💻",
  "lab-equipment": "🔬",
  sports: "🏸",
  stationery: "✏️",
  other: "🎒",
};

// Format fees in Indian rupees.
function money(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

// Display readable dates.
function dateLabel(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-IN");
}

// Use local calendar date for date-input minimums.
function todayValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ------------------------------------------------------------
// BRAND COMPONENT
// Reusable Lendly branding.
// ------------------------------------------------------------
function Brand({ onClick }) {
  return (
    <button
      type="button"
      className="lendly-brand"
      onClick={onClick}
      aria-label="Go to Lendly home"
    >
      <span className="lendly-brand-icon">L</span>
      <span>Lendly</span>
    </button>
  );
}

// ------------------------------------------------------------
// FEEDBACK COMPONENT
// Displays API success and error messages accessibly.
// ------------------------------------------------------------
function Feedback({ message, type = "info" }) {
  if (!message) return null;

  return (
    <div
      className={`lendly-feedback ${type}`}
      role={type === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {message}
    </div>
  );
}

// ============================================================
// MAIN APPLICATION
// ============================================================
export default function App() {
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);

  // Restore the current session when the page refreshes.
  useEffect(() => {
    const savedToken = sessionStorage.getItem("lendlyToken");
    if (!savedToken) return;

    let active = true;

    apiRequest("/auth/me", { token: savedToken })
      .then((result) => {
        if (!active) return;
        setToken(savedToken);
        setUser(result.user);
      })
      .catch(() => {
        sessionStorage.removeItem("lendlyToken");
      });

    return () => {
      active = false;
    };
  }, []);

  // Show a message in a consistent way.
  function showMessage(text, type = "info") {
    setMessage(text);
    setMessageType(type);
  }

  // Switch between authentication forms.
  function switchAuthMode(mode) {
    setAuthMode(mode);
    showMessage("");
  }

  // ----------------------------------------------------------
  // REGISTER
  // Checks input and asks the backend to create an account.
  // The backend hashes passwords and creates a verification code.
  // ----------------------------------------------------------
  async function handleRegister(event) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (fullName.length < 2) {
      showMessage("Enter your full name.", "error");
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      showMessage(
        "Use the college format name.YYbranch@kongu.edu.",
        "error"
      );
      return;
    }

    if (!PASSWORD_PATTERN.test(password)) {
      showMessage(
        "Password needs 8+ characters, uppercase, lowercase, a number and a symbol.",
        "error"
      );
      return;
    }

    if (password !== confirmPassword) {
      showMessage("Your passwords do not match.", "error");
      return;
    }

    setLoading(true);
    showMessage("");

    try {
      const result = await apiRequest("/auth/register", {
        method: "POST",
        body: { fullName, email, password },
      });

      setPendingEmail(email);
      setAuthMode("verify");
      showMessage(result.message, "success");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------------------------
  // VERIFY COLLEGE EMAIL
  // Submits the six-digit code to the backend.
  // ----------------------------------------------------------
  async function handleVerify(event) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const code = String(form.get("code") || "").trim();

    setLoading(true);
    showMessage("");

    try {
      const result = await apiRequest("/auth/verify-email", {
        method: "POST",
        body: { email, code },
      });

      setPendingEmail(email);
      setAuthMode("login");
      showMessage(result.message, "success");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------------------------
  // LOGIN
  // The backend verifies the password and returns a signed token.
  // ----------------------------------------------------------
  async function handleLogin(event) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");

    if (!EMAIL_PATTERN.test(email)) {
      showMessage("Enter a valid Kongu college email.", "error");
      return;
    }

    setLoading(true);
    showMessage("");

    try {
      const result = await apiRequest("/auth/login", {
        method: "POST",
        body: { email, password },
      });

      sessionStorage.setItem("lendlyToken", result.token);
      setToken(result.token);
      setUser(result.user);
      showMessage("");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // Sign out and discard the local session token.
  function handleLogout() {
    sessionStorage.removeItem("lendlyToken");
    setToken("");
    setUser(null);
    setAuthMode("login");
    showMessage("You have signed out of Lendly.", "success");
  }

  // When a student is signed in, show the full portal.
  if (user && token) {
    return (
      <StudentPortal
        user={user}
        token={token}
        onLogout={handleLogout}
      />
    );
  }

  // ==========================================================
  // LOGIN / REGISTER / EMAIL-VERIFICATION UI
  // ==========================================================
  return (
    <div className="lendly-auth-page">
      <header className="lendly-public-header">
        <Brand onClick={() => switchAuthMode("login")} />
        <span className="lendly-header-caption">
          Your campus sharing community
        </span>
      </header>

      <main className="lendly-auth-layout">
        {/* Introduction panel with the project's key benefits. */}
        <section className="lendly-intro">
          <span className="lendly-eyebrow">MADE FOR CAMPUS LIFE</span>

          <h1>
            Borrow what
            <br />
            you need.
            <br />
            <span>Share what you have.</span>
          </h1>

          <p>
            Discover useful items around campus. Share resources,
            save money, and make student life easier with Lendly.
          </p>

          <div className="lendly-benefits">
            <Benefit
              number="01"
              title="Find everyday essentials"
              description="Search books, calculators and more."
            />
            <Benefit
              number="02"
              title="Borrow on your terms"
              description="See daily fees and request dates."
            />
            <Benefit
              number="03"
              title="Share with your campus"
              description="Help fellow students use resources wisely."
            />
          </div>
        </section>

        {/* Authentication card. */}
        <section className="lendly-auth-card">
          <div className="lendly-auth-heading">
            <div className="lendly-auth-logo">L</div>
            <p className="lendly-eyebrow">WELCOME TO LENDLY</p>

            <h2>
              {authMode === "login"
                ? "Good to see you."
                : authMode === "register"
                  ? "Join your campus."
                  : "Verify your email."}
            </h2>

            <p>
              {authMode === "login"
                ? "Sign in with your college account."
                : authMode === "register"
                  ? "Create your student account."
                  : "Enter the six-digit verification code."}
            </p>
          </div>

          {/* Login and registration tabs. */}
          {authMode !== "verify" && (
            <div className="lendly-auth-tabs">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => switchAuthMode("login")}
              >
                Sign in
              </button>

              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => switchAuthMode("register")}
              >
                Create account
              </button>
            </div>
          )}

          {/* Sign-in form. */}
          {authMode === "login" && (
            <form
              key="login"
              className="lendly-form"
              onSubmit={handleLogin}
            >
              <FormField
                id="loginEmail"
                name="email"
                label="College email"
                type="email"
                placeholder="you.25it@kongu.edu"
                autoComplete="email"
                required
              />

              <FormField
                id="loginPassword"
                name="password"
                label="Password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />

              <p className="lendly-helper">
                Use your official Kongu college email address.
              </p>

              <button
                className="lendly-primary-button"
                type="submit"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in to Lendly"}
                <span>→</span>
              </button>

              <Feedback message={message} type={messageType} />
            </form>
          )}

          {/* Registration form. */}
          {authMode === "register" && (
            <form
              key="register"
              className="lendly-form"
              onSubmit={handleRegister}
            >
              <FormField
                id="registerName"
                name="fullName"
                label="Full name"
                placeholder="Enter your full name"
                autoComplete="name"
                minLength={2}
                required
              />

              <FormField
                id="registerEmail"
                name="email"
                label="College email"
                type="email"
                placeholder="you.25it@kongu.edu"
                autoComplete="email"
                required
              />

              <p className="lendly-helper">
                Format: name.YYbranch@kongu.edu
              </p>

              <FormField
                id="registerPassword"
                name="password"
                label="Password"
                type="password"
                placeholder="Create a strong password"
                autoComplete="new-password"
                minLength={8}
                required
              />

              <p className="lendly-helper">
                At least 8 characters with uppercase, lowercase, a number
                and a special character.
              </p>

              <FormField
                id="confirmPassword"
                name="confirmPassword"
                label="Confirm password"
                type="password"
                placeholder="Enter your password again"
                autoComplete="new-password"
                minLength={8}
                required
              />

              <button
                className="lendly-primary-button"
                type="submit"
                disabled={loading}
              >
                {loading ? "Creating account..." : "Create my account"}
                <span>→</span>
              </button>

              <Feedback message={message} type={messageType} />
            </form>
          )}

          {/* Email-verification form. */}
          {authMode === "verify" && (
            <form
              key="verify"
              className="lendly-form"
              onSubmit={handleVerify}
            >
              <FormField
                id="verifyEmail"
                name="email"
                label="College email"
                type="email"
                value={pendingEmail}
                onChange={(event) => setPendingEmail(event.target.value)}
                autoComplete="email"
                required
              />

              <FormField
                id="verifyCode"
                name="code"
                label="Six-digit verification code"
                placeholder="000000"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                autoComplete="one-time-code"
                required
              />

              <p className="lendly-helper">
                When SMTP isn't configured, check the backend terminal
                for the development verification code.
              </p>

              <button
                className="lendly-primary-button"
                type="submit"
                disabled={loading}
              >
                {loading ? "Verifying..." : "Verify college email"}
                <span>→</span>
              </button>

              <button
                type="button"
                className="lendly-link-button"
                onClick={() => switchAuthMode("login")}
              >
                Back to sign in
              </button>

              <Feedback message={message} type={messageType} />
            </form>
          )}

          <p className="lendly-terms">
            Borrow responsibly. Respect other students and their belongings.
          </p>
        </section>
      </main>

      <footer className="lendly-public-footer">
        <span>© 2026 Lendly Campus Project</span>
        <span>Built for students, powered by sharing.</span>
      </footer>
    </div>
  );
}

// ============================================================
// SMALL REUSABLE UI COMPONENTS
// ============================================================

// Benefit row used on the public welcome panel.
function Benefit({ number, title, description }) {
  return (
    <div className="lendly-benefit">
      <span>{number}</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

// Label and input grouped consistently for accessibility.
function FormField({ id, name, label, type = "text", ...props }) {
  return (
    <div className="lendly-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} {...props} />
    </div>
  );
}

// ============================================================
// STUDENT PORTAL
// Includes browse, create listing, my listings, borrowing requests,
// incoming requests, profile and a basic admin landing view.
// ============================================================
function StudentPortal({ user, token, onLogout }) {
  const [page, setPage] = useState("overview");
  const [items, setItems] = useState([]);
  const [myItems, setMyItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Request helper includes the authenticated student's token.
  function callApi(endpoint, options = {}) {
    return apiRequest(endpoint, { ...options, token });
  }

  // Central navigation resets stale feedback.
  function navigate(destination) {
    setPage(destination);
    setError("");
    setNotice("");
  }

  // Load data based on the currently selected portal screen.
  useEffect(() => {
    let active = true;

    async function loadPage() {
      setLoading(true);
      setError("");

      try {
        if (page === "browse") {
          const query = new URLSearchParams();

          if (search) query.set("search", search);
          if (category) query.set("category", category);

          const suffix = query.toString() ? `?${query}` : "";
          const result = await callApi(`/items${suffix}`);

          if (active) setItems(result.items || []);
        }

        if (page === "listings") {
          const result = await callApi("/items/mine");
          if (active) setMyItems(result.items || []);
        }

        if (page === "borrowings") {
          const result = await callApi("/borrow/mine");
          if (active) setRequests(result.requests || []);
        }

        if (page === "incoming") {
          const result = await callApi("/borrow/incoming");
          if (active) setIncoming(result.requests || []);
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPage();
    return () => {
      active = false;
    };
  }, [page, search, category, reload, token]);

  // Submit a date-based borrowing request.
  async function handleBorrow(itemId, event) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);

    setBusy(itemId);
    setError("");
    setNotice("");

    try {
      const result = await callApi(`/borrow/${itemId}`, {
        method: "POST",
        body: {
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
        },
      });

      setNotice(result.message);
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  // Publish a new listing. Ownership is assigned by the backend.
  async function handleCreateItem(event) {
    event.preventDefault();
    if (busy) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const body = {
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim(),
      category: form.get("category"),
      itemCondition: form.get("itemCondition"),
      feePerDay: Number(form.get("feePerDay")),
      imageUrl: String(form.get("imageUrl") || "").trim(),
    };

    setBusy("create");
    setError("");
    setNotice("");

    try {
      const result = await callApi("/items", {
        method: "POST",
        body,
      });

      formElement.reset();
      setNotice(result.message);
      setPage("listings");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  // Edit listing availability or safely remove a listing.
  async function handleListingAction(item, action) {
    if (busy) return;

    if (
      action === "remove" &&
      !window.confirm(`Remove "${item.title}" from Lendly?`)
    ) {
      return;
    }

    setBusy(item._id);
    setError("");
    setNotice("");

    try {
      const result =
        action === "remove"
          ? await callApi(`/items/${item._id}`, { method: "DELETE" })
          : await callApi(`/items/${item._id}`, {
              method: "PATCH",
              body: { status: action },
            });

      setNotice(result.message);
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  // Owners make the decision on incoming borrowing requests.
  async function handleDecision(requestId, decision) {
    if (busy) return;

    setBusy(requestId);
    setError("");
    setNotice("");

    try {
      const result = await callApi(`/borrow/${requestId}/decision`, {
        method: "PATCH",
        body: { decision },
      });

      setNotice(result.message);
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  // Owners record handover and return events.
  async function handleBorrowStatus(requestId, action) {
    if (busy) return;

    setBusy(requestId);
    setError("");
    setNotice("");

    try {
      const result = await callApi(`/borrow/${requestId}/${action}`, {
        method: "PATCH",
      });

      setNotice(result.message);
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  // Render one marketplace listing and the relevant controls.
  function renderItem(item, ownListing = false) {
    const ownerId =
      typeof item.owner === "object"
        ? String(item.owner?._id || "")
        : String(item.owner || "");

    const isOwner = ownerId === String(user.id);

    return (
      <article className="lendly-item-card" key={item._id}>
        <div className="lendly-item-art">
          <span>{CATEGORY_EMOJI[item.category] || "🎒"}</span>
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.title}
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>

        <div className="lendly-item-body">
          <div className="lendly-item-meta">
            <span>{CATEGORY_NAMES[item.category] || "Other"}</span>
            <span>{item.itemCondition || "Good"}</span>
          </div>

          <h3>{item.title}</h3>
          <p className="lendly-item-description">{item.description}</p>

          <div className="lendly-price">
            <strong>{money(item.feePerDay)}</strong>
            <span>per day</span>
          </div>

          <p className="lendly-item-owner">
            {ownListing || isOwner
              ? "Your listing"
              : `Owner: ${item.owner?.fullName || "Campus student"}`}
          </p>

          {ownListing ? (
            <div className="lendly-action-row">
              <button
                className="lendly-small-button secondary"
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  handleListingAction(
                    item,
                    item.status === "available" ? "paused" : "available"
                  )
                }
              >
                {item.status === "available" ? "Pause" : "Make available"}
              </button>

              <button
                className="lendly-small-button danger"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => handleListingAction(item, "remove")}
              >
                Remove
              </button>
            </div>
          ) : isOwner ? (
            <p className="lendly-helper">You own this item.</p>
          ) : (
            item.status === "available" && (
              <form
                className="lendly-borrow-form"
                onSubmit={(event) => handleBorrow(item._id, event)}
              >
                <label>
                  Borrow from
                  <input
                    name="startDate"
                    type="date"
                    min={todayValue()}
                    required
                  />
                </label>
                <label>
                  Return by
                  <input name="endDate" type="date" required />
                </label>

                <button
                  className="lendly-primary-button"
                  type="submit"
                  disabled={Boolean(busy)}
                >
                  {busy === item._id ? "Sending..." : "Request to borrow"}
                </button>
              </form>
            )
          )}
        </div>
      </article>
    );
  }

  // Render one borrowing request with owner actions when appropriate.
  function renderRequest(request, isIncoming = false) {
    const item = request.item || {};
    const otherPerson = isIncoming ? request.borrower : request.owner;

    return (
      <article className="lendly-request-card" key={request._id}>
        <div className="lendly-request-detail">
          <StatusBadge status={request.status} />
          <h3>{item.title || "Campus item"}</h3>
          <p>
            {isIncoming ? "Borrower" : "Owner"}:{" "}
            {otherPerson?.fullName || "Student"}
          </p>
          <p>
            {dateLabel(request.startDate)} – {dateLabel(request.endDate)}
          </p>
          <p>
            Daily fee: {money(request.feePerDay)} · Total:{" "}
            {money(request.totalFee)}
          </p>
          {request.ownerNote && <p>Note: {request.ownerNote}</p>}
        </div>

        {isIncoming && (
          <div className="lendly-action-row">
            {request.status === "pending" && (
              <>
                <button
                  type="button"
                  className="lendly-small-button primary"
                  disabled={Boolean(busy)}
                  onClick={() => handleDecision(request._id, "approve")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="lendly-small-button danger"
                  disabled={Boolean(busy)}
                  onClick={() => handleDecision(request._id, "reject")}
                >
                  Reject
                </button>
              </>
            )}

            {request.status === "approved" && (
              <button
                type="button"
                className="lendly-small-button primary"
                disabled={Boolean(busy)}
                onClick={() => handleBorrowStatus(request._id, "checkout")}
              >
                Mark handed over
              </button>
            )}

            {request.status === "borrowed" && (
              <button
                type="button"
                className="lendly-small-button primary"
                disabled={Boolean(busy)}
                onClick={() => handleBorrowStatus(request._id, "return")}
              >
                Confirm return
              </button>
            )}
          </div>
        )}
      </article>
    );
  }

  // If signed in with the admin role, show the separate admin area.
  // Admin moderation APIs will be connected in a subsequent stage.
  const isAdmin = user.role === "admin";

  const navigation = [
    ["overview", "Overview"],
    ["browse", "Browse items"],
    ["create", "List an item"],
    ["listings", "My listings"],
    ["borrowings", "My borrowings"],
    ["incoming", "Incoming requests"],
    ["profile", "Profile"],
    ...(isAdmin ? [["admin", "Admin workspace"]] : []),
  ];

  // Main content switch for the student portal.
  function renderContent() {
    if (page === "overview") {
      return (
        <>
          <PageHeading
            eyebrow="YOUR CAMPUS, CONNECTED"
            title={`Welcome, ${user.fullName}.`}
            description="What would you like to do today?"
          />

          <div className="lendly-overview-grid">
            {[
              ["🔎", "Browse items", "Find what you need on campus.", "browse"],
              ["＋", "List an item", "Share an item with fellow students.", "create"],
              ["📦", "My listings", "Manage your available items.", "listings"],
              ["📅", "My borrowings", "Track requests and return dates.", "borrowings"],
              ["✓", "Incoming requests", "Respond to borrowing requests.", "incoming"],
            ].map(([icon, title, description, destination]) => (
              <button
                type="button"
                className="lendly-action-tile"
                key={destination}
                onClick={() => navigate(destination)}
              >
                <span>{icon}</span>
                <strong>{title}</strong>
                <p>{description}</p>
              </button>
            ))}
          </div>
        </>
      );
    }

    if (page === "browse") {
      return (
        <>
          <PageHeading
            eyebrow="CAMPUS MARKETPLACE"
            title="Find what you need."
            description="Discover items listed by verified Kongu students."
          />

          <form
            className="lendly-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchText.trim());
            }}
          >
            <input
              aria-label="Search listings"
              placeholder="Search books, calculators, equipment..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />

            <select
              aria-label="Filter category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_NAMES[value]}
                </option>
              ))}
            </select>

            <button type="submit" className="lendly-primary-button">
              Search
            </button>
          </form>

          {loading ? (
            <EmptyState title="Loading items..." />
          ) : items.length ? (
            <div className="lendly-item-grid">
              {items.map((item) => renderItem(item))}
            </div>
          ) : (
            <EmptyState
              title="No items found"
              description="Try a different search, or list the first item."
              action="List an item"
              onAction={() => navigate("create")}
            />
          )}
        </>
      );
    }

    if (page === "create") {
      return (
        <>
          <PageHeading
            eyebrow="SHARE WITH YOUR CAMPUS"
            title="List a new item."
            description="Set clear borrowing terms for other students."
          />

          <form className="lendly-form-panel" onSubmit={handleCreateItem}>
            <FormField
              id="itemTitle"
              name="title"
              label="Item title"
              placeholder="e.g. Scientific calculator"
              minLength={2}
              maxLength={100}
              required
            />

            <div className="lendly-field">
              <label htmlFor="itemDescription">Description</label>
              <textarea
                id="itemDescription"
                name="description"
                minLength={10}
                maxLength={1500}
                rows={4}
                placeholder="Describe the item, its condition and borrowing terms."
                required
              />
            </div>

            <div className="lendly-form-row">
              <div className="lendly-field">
                <label htmlFor="itemCategory">Category</label>
                <select id="itemCategory" name="category" required>
                  {CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {CATEGORY_NAMES[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lendly-field">
                <label htmlFor="itemCondition">Condition</label>
                <select
                  id="itemCondition"
                  name="itemCondition"
                  defaultValue="good"
                  required
                >
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="needs-repair">Needs repair</option>
                </select>
              </div>
            </div>

            <div className="lendly-form-row">
              <div className="lendly-field">
                <label htmlFor="itemFee">Daily fee (₹)</label>
                <input
                  id="itemFee"
                  name="feePerDay"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  defaultValue="0"
                  required
                />
                <span className="lendly-helper">Enter zero for free borrowing.</span>
              </div>

              <div className="lendly-field">
                <label htmlFor="itemImage">Image URL (optional)</label>
                <input
                  id="itemImage"
                  name="imageUrl"
                  type="url"
                  maxLength={2048}
                  placeholder="https://example.com/item.jpg"
                />
              </div>
            </div>

            <button
              className="lendly-primary-button"
              type="submit"
              disabled={Boolean(busy)}
            >
              {busy === "create" ? "Publishing..." : "Publish listing"}
            </button>
          </form>
        </>
      );
    }

    if (page === "listings") {
      return (
        <>
          <PageHeading
            eyebrow="YOUR SHARED RESOURCES"
            title="My listings."
            description="Manage your item details and availability."
          />

          {loading ? (
            <EmptyState title="Loading your listings..." />
          ) : myItems.length ? (
            <div className="lendly-item-grid">
              {myItems.map((item) => (
                <div key={item._id}>
                  {renderItem(item, true)}
                  <p className="lendly-listing-status">
                    Status: {item.status}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="You haven't listed anything yet."
              description="Share your first item with fellow students."
              action="Create listing"
              onAction={() => navigate("create")}
            />
          )}
        </>
      );
    }

    if (page === "borrowings") {
      return (
        <>
          <PageHeading
            eyebrow="YOUR REQUESTS"
            title="My borrowings."
            description="Track request status, fees and return dates."
          />

          {loading ? (
            <EmptyState title="Loading borrowing requests..." />
          ) : requests.length ? (
            <div className="lendly-request-list">
              {requests.map((request) => renderRequest(request))}
            </div>
          ) : (
            <EmptyState
              title="No borrowings yet."
              description="Browse campus items to send your first request."
              action="Browse items"
              onAction={() => navigate("browse")}
            />
          )}
        </>
      );
    }

    if (page === "incoming") {
      return (
        <>
          <PageHeading
            eyebrow="LENDER WORKSPACE"
            title="Incoming requests."
            description="Respond to requests and record item returns."
          />

          {loading ? (
            <EmptyState title="Loading incoming requests..." />
          ) : incoming.length ? (
            <div className="lendly-request-list">
              {incoming.map((request) => renderRequest(request, true))}
            </div>
          ) : (
            <EmptyState
              title="No incoming requests."
              description="Requests for your listings will appear here."
            />
          )}
        </>
      );
    }

    if (page === "profile") {
      return (
        <>
          <PageHeading
            eyebrow="YOUR ACCOUNT"
            title="Student profile."
            description="Your account information from Lendly."
          />

          <div className="lendly-profile-card">
            <div className="lendly-profile-avatar">
              {String(user.fullName || "S").charAt(0).toUpperCase()}
            </div>
            <h2>{user.fullName}</h2>
            <p>{user.email}</p>
            <ProfileRow label="Branch" value={user.branch || "Not provided"} />
            <ProfileRow
              label="Joining year"
              value={user.joiningYear || "Not provided"}
            />
            <ProfileRow
              label="Email status"
              value={user.isEmailVerified ? "Verified" : "Not verified"}
            />
            <ProfileRow label="Role" value={user.role} />
          </div>
        </>
      );
    }

    if (page === "admin" && isAdmin) {
      return (
        <>
          <PageHeading
            eyebrow="ADMINISTRATION"
            title="Admin workspace."
            description="This area is visible only to accounts assigned the admin role."
          />
          <EmptyState
            title="Administration UI is ready for integration."
            description="User moderation and listing-management endpoints must be completed before admin actions are enabled."
          />
        </>
      );
    }

    return (
      <EmptyState
        title="Page not found."
        action="Go to overview"
        onAction={() => navigate("overview")}
      />
    );
  }

  return (
    <div className="lendly-portal">
      {/* Portal header with signed-in account and sign-out action. */}
      <header className="lendly-portal-header">
        <Brand onClick={() => navigate("overview")} />

        <div className="lendly-user-actions">
          <span>{user.fullName}</span>
          <button
            className="lendly-small-button secondary"
            type="button"
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main navigation for the portal's component screens. */}
      <nav className="lendly-portal-nav" aria-label="Portal navigation">
        {navigation.map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={page === value ? "active" : ""}
            onClick={() => navigate(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Current screen and API feedback. */}
      <main className="lendly-portal-content">
        <Feedback message={error} type="error" />
        <Feedback message={notice} type="success" />
        {renderContent()}
      </main>

      <footer className="lendly-portal-footer">
        <span>© 2026 Lendly Campus Project</span>
        <span>Borrow smarter. Share on campus.</span>
      </footer>
    </div>
  );
}

// ============================================================
// PORTAL UI COMPONENTS
// ============================================================

// Page heading with consistent hierarchy and spacing.
function PageHeading({ eyebrow, title, description }) {
  return (
    <div className="lendly-page-heading">
      <p className="lendly-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

// Empty/loading state, with an optional action button.
function EmptyState({ title, description, action, onAction }) {
  return (
    <section className="lendly-empty-state">
      <span aria-hidden="true">📦</span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && onAction && (
        <button
          type="button"
          className="lendly-primary-button"
          onClick={onAction}
        >
          {action}
        </button>
      )}
    </section>
  );
}

// Borrowing status badge.
function StatusBadge({ status }) {
  return (
    <span className={`lendly-status lendly-status-${status}`}>
      {status}
    </span>
  );
}

// Read-only profile detail row.
function ProfileRow({ label, value }) {
  return (
    <div className="lendly-profile-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
