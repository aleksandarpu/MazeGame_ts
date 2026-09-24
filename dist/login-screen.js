export function renderLoginScreen(container, onLogin) {
    // Clear container and set full-screen center alignment
    container.innerHTML = "";
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        backgroundColor: "#2c3e50",
        fontFamily: "Arial, sans-serif",
        color: "#fff",
        boxSizing: "border-box",
    });
    // Create the Login Modal Box
    const loginBox = document.createElement("div");
    Object.assign(loginBox.style, {
        backgroundColor: "#ecf0f1",
        padding: "40px",
        borderRadius: "10px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
        textAlign: "center",
        color: "#333",
        width: "350px",
    });
    // Title & Subtitle
    const title = document.createElement("h1");
    title.innerText = "Maze Game";
    title.style.margin = "0 0 10px 0";
    title.style.color = "#2980b9";
    const subtitle = document.createElement("p");
    subtitle.innerText = "Select a player name to begin";
    subtitle.style.margin = "0 0 25px 0";
    subtitle.style.color = "#7f8c8d";
    // Name Input Field
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Enter Player Name";
    nameInput.maxLength = 16; // Keep names UI-friendly
    Object.assign(nameInput.style, {
        width: "100%",
        padding: "12px",
        fontSize: "16px",
        marginBottom: "20px",
        borderRadius: "5px",
        border: "2px solid #bdc3c7",
        boxSizing: "border-box",
        outline: "none",
    });
    // Submit Button
    const loginBtn = document.createElement("button");
    loginBtn.innerText = "Enter Lobby";
    Object.assign(loginBtn.style, {
        width: "100%",
        padding: "12px",
        fontSize: "18px",
        backgroundColor: "#27ae60",
        color: "#fff",
        border: "none",
        borderRadius: "5px",
        cursor: "pointer",
        fontWeight: "bold",
        transition: "background 0.2s",
    });
    loginBtn.onmouseover = () => (loginBtn.style.backgroundColor = "#2ecc71");
    loginBtn.onmouseleave = () => (loginBtn.style.backgroundColor = "#27ae60");
    // Authentication Logic
    const submitName = () => {
        const name = nameInput.value.trim();
        if (name) {
            // Trigger the callback to save to Firestore and transition the view
            onLogin(name);
        }
        else {
            // Basic validation feedback
            nameInput.style.borderColor = "#e74c3c";
            nameInput.placeholder = "Name cannot be empty!";
            // Reset border color on next input
            nameInput.addEventListener("input", () => {
                nameInput.style.borderColor = "#bdc3c7";
            }, { once: true });
        }
    };
    loginBtn.onclick = submitName;
    // Allow hitting 'Enter' to submit
    nameInput.onkeydown = (e) => {
        if (e.key === "Enter") {
            submitName();
        }
    };
    // Assemble the UI
    loginBox.appendChild(title);
    loginBox.appendChild(subtitle);
    loginBox.appendChild(nameInput);
    loginBox.appendChild(loginBtn);
    container.appendChild(loginBox);
    // Automatically focus the input field for immediate typing
    nameInput.focus();
}
