// Card layout shared by the lobby and game room screens (sc-* classes):
// a centered card on a dark background, with a blue header and big buttons.
export function injectScreenStyles() {
  if (document.getElementById("screen-card-styles")) return;
  const style = document.createElement("style");
  style.id = "screen-card-styles";
  style.textContent = `
    .sc-page {
      min-height: 100%;
      box-sizing: border-box;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 40px 16px;
      background: radial-gradient(circle at 20% 0%, #3b5873 0%, #2c3e50 55%, #1f2d3a 100%);
      font-family: Fredoka, Arial, sans-serif;
      color: #2c3e50;
    }
    .sc-card {
      width: 100%;
      max-width: 640px;
      background: #ecf0f1;
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }
    .sc-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 16px;
      padding: 20px 24px;
      background: linear-gradient(135deg, #2471a3, #3498db);
      color: #fff;
    }
    .sc-title { flex: 1; min-width: 0; margin: 0; font-size: 28px; overflow-wrap: anywhere; }
    .sc-count { flex: none; padding: 4px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.2); font-weight: 600; }
    .sc-head select { font-family: inherit; }
    .sc-body { padding: 20px 24px 24px; }
    .sc-subtitle { margin: 0 0 12px; font-size: 15px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #7f8c8d; }
    .sc-btn {
      flex: 1 1 200px;
      padding: 14px 18px;
      border: none;
      border-radius: 12px;
      font-family: inherit;
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      cursor: pointer;
      box-shadow: 0 4px 0 rgba(0, 0, 0, 0.2);
      transition: transform 0.1s, box-shadow 0.1s, filter 0.2s;
    }
    .sc-btn:hover { filter: brightness(1.08); }
    .sc-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(0, 0, 0, 0.2); }
    .sc-btn:disabled { cursor: not-allowed; filter: grayscale(0.6); opacity: 0.7; }
    .sc-btn.green { background: #27ae60; }
    .sc-btn.orange { background: #e67e22; }
    .sc-btn.blue { background: #2980b9; }
    .sc-btn.grey { background: #95a5a6; }
    @media (max-width: 480px) {
      .sc-page { padding: 16px; }
      .sc-head, .sc-body { padding-left: 16px; padding-right: 16px; }
      .sc-title { font-size: 22px; }
    }
  `;
  document.head.appendChild(style);
}
