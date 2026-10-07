let toastTimer = 0;

export function showToast(msg: string, undo?: () => void): void {
  const el = document.getElementById("toast");
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = "";

  const text = document.createElement("span");
  text.className = "toast-msg";
  text.textContent = msg;
  el.append(text);

  if (undo) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-undo keycap";
    btn.textContent = "Undo";
    btn.addEventListener("click", () => {
      undo();
      el.hidden = true;
      clearTimeout(toastTimer);
    });
    el.append(btn);
  }

  el.hidden = false;
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 4500);
}
