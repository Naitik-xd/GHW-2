(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GradeLab = api;
  if (typeof document !== "undefined") {
    api.mount(document);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PALETTE_SIZE = 5;

  const SCHEMES = [
    {
      name: "analogous",
      hues: (h) => [h - 36, h - 18, h, h + 18, h + 36],
      sats: [58, 64, 70, 62, 54],
      lights: [28, 42, 52, 62, 74],
    },
    {
      name: "monochrome",
      hues: (h) => [h, h, h, h, h],
      sats: [42, 50, 58, 48, 38],
      lights: [18, 32, 48, 64, 78],
    },
    {
      name: "complement",
      hues: (h) => [h, h + 12, h + 180, h + 192, h + 8],
      sats: [62, 48, 58, 44, 36],
      lights: [30, 48, 42, 62, 74],
    },
    {
      name: "split",
      hues: (h) => [h, h - 24, h + 24, h + 150, h + 210],
      sats: [68, 54, 50, 58, 46],
      lights: [36, 52, 68, 40, 58],
    },
    {
      name: "triadic",
      hues: (h) => [h, h + 120, h + 240, h + 30, h + 150],
      sats: [60, 52, 48, 40, 56],
      lights: [34, 46, 58, 70, 42],
    },
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrapHue(hue) {
    return ((hue % 360) + 360) % 360;
  }

  function toHex(channel) {
    return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
  }

  function hueToRgb(p, q, t) {
    let tone = t;
    if (tone < 0) tone += 1;
    if (tone > 1) tone -= 1;
    if (tone < 1 / 6) return p + (q - p) * 6 * tone;
    if (tone < 1 / 2) return q;
    if (tone < 2 / 3) return p + (q - p) * (2 / 3 - tone) * 6;
    return p;
  }

  function hslToHex(h, s, l) {
    const sat = clamp(s, 0, 100) / 100;
    const light = clamp(l, 0, 100) / 100;
    const hue = wrapHue(h) / 360;
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    const r = hueToRgb(p, q, hue + 1 / 3) * 255;
    const g = hueToRgb(p, q, hue) * 255;
    const b = hueToRgb(p, q, hue - 1 / 3) * 255;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  function createEmptySlots() {
    return Array.from({ length: PALETTE_SIZE }, () => ({
      hex: "#000000",
      locked: false,
    }));
  }

  function generateHarmoniousPalette(rng) {
    const random = rng || Math.random;
    const baseHue = Math.floor(random() * 360);
    const scheme = SCHEMES[Math.floor(random() * SCHEMES.length)];
    return scheme.hues(baseHue).map((hue, index) =>
      hslToHex(hue, scheme.sats[index], scheme.lights[index])
    );
  }

  function mergePalette(slots, nextColors) {
    return slots.map((slot, index) => {
      if (slot.locked) {
        return { hex: slot.hex, locked: true };
      }
      return { hex: nextColors[index], locked: false };
    });
  }

  function toggleLock(slots, index) {
    return slots.map((slot, slotIndex) => {
      if (slotIndex !== index) return slot;
      return { hex: slot.hex, locked: !slot.locked };
    });
  }

  function formatAllHex(slots) {
    return slots.map((slot) => slot.hex.toUpperCase()).join(" ");
  }

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return Boolean(target.isContentEditable);
  }

  function fallbackCopy(text, doc) {
    const documentRef = doc || document;
    const field = documentRef.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "0";
    field.style.opacity = "0";
    documentRef.body.appendChild(field);
    field.focus();
    field.select();
    let copied = false;
    try {
      copied = documentRef.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    documentRef.body.removeChild(field);
    return copied;
  }

  async function copyText(text, options) {
    const opts = options || {};
    const nav = opts.navigatorRef || (typeof navigator !== "undefined" ? navigator : null);
    const secure =
      typeof opts.isSecureContext === "boolean"
        ? opts.isSecureContext
        : typeof window !== "undefined"
          ? window.isSecureContext
          : false;
    const clipboard = nav && nav.clipboard;

    if (clipboard && typeof clipboard.writeText === "function" && secure) {
      try {
        await clipboard.writeText(text);
        return true;
      } catch (error) {
        return fallbackCopy(text, opts.documentRef);
      }
    }

    return fallbackCopy(text, opts.documentRef);
  }

  function mount(documentRef) {
    const paletteEl = documentRef.getElementById("palette");
    const generateBtn = documentRef.getElementById("generate-btn");
    const copyAllBtn = documentRef.getElementById("copy-all-btn");
    const toastEl = documentRef.getElementById("toast");
    if (!paletteEl || !generateBtn || !copyAllBtn || !toastEl) return;

    let slots = createEmptySlots();
    let toastTimer = 0;

    function showToast(message, isError) {
      toastEl.hidden = false;
      toastEl.textContent = message;
      toastEl.classList.toggle("is-error", Boolean(isError));
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () {
        toastEl.hidden = true;
      }, 1800);
    }

    function render() {
      paletteEl.replaceChildren();
      slots.forEach(function (slot, index) {
        const article = documentRef.createElement("article");
        article.className = "swatch";

        const color = documentRef.createElement("div");
        color.className = "swatch-color";
        color.style.backgroundColor = slot.hex;
        color.setAttribute("role", "img");
        color.setAttribute("aria-label", "Color " + (index + 1) + " " + slot.hex);

        const label = documentRef.createElement("p");
        label.className = "swatch-index";
        label.textContent = "Look 0" + (index + 1);
        color.appendChild(label);

        const meta = documentRef.createElement("div");
        meta.className = "swatch-meta";

        const hex = documentRef.createElement("p");
        hex.className = "hex-code";
        hex.textContent = slot.hex;

        const actions = documentRef.createElement("div");
        actions.className = "swatch-actions";

        const copyBtn = documentRef.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "btn btn-compact";
        copyBtn.textContent = "Copy";
        copyBtn.setAttribute("aria-label", "Copy " + slot.hex);

        const lockBtn = documentRef.createElement("button");
        lockBtn.type = "button";
        lockBtn.className = "btn btn-compact lock-btn";
        lockBtn.setAttribute("aria-pressed", String(slot.locked));
        lockBtn.setAttribute(
          "aria-label",
          slot.locked ? "Unlock " + slot.hex : "Lock " + slot.hex
        );
        lockBtn.textContent = slot.locked ? "Locked" : "Lock Color";

        copyBtn.addEventListener("click", function () {
          copyHex(slot.hex);
        });
        lockBtn.addEventListener("click", function () {
          slots = toggleLock(slots, index);
          render();
        });

        actions.append(copyBtn, lockBtn);
        meta.append(hex, actions);
        article.append(color, meta);
        paletteEl.appendChild(article);
      });
    }

    function generate() {
      slots = mergePalette(slots, generateHarmoniousPalette());
      render();
    }

    async function copyHex(value) {
      const copied = await copyText(value);
      if (copied) {
        showToast("Copied " + value);
      } else {
        showToast("Could not copy. Select the HEX code instead.", true);
      }
    }

    async function copyAll() {
      const value = formatAllHex(slots);
      const copied = await copyText(value);
      if (copied) {
        showToast("Copied all five HEX codes");
      } else {
        showToast("Could not copy. Select the HEX codes instead.", true);
      }
    }

    generateBtn.addEventListener("click", generate);
    copyAllBtn.addEventListener("click", copyAll);

    documentRef.addEventListener("keydown", function (event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isTypingTarget(event.target)) return;

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        generate();
        return;
      }

      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        copyAll();
      }
    });

    generate();
  }

  return {
    PALETTE_SIZE: PALETTE_SIZE,
    SCHEMES: SCHEMES,
    hslToHex: hslToHex,
    generateHarmoniousPalette: generateHarmoniousPalette,
    mergePalette: mergePalette,
    toggleLock: toggleLock,
    formatAllHex: formatAllHex,
    isTypingTarget: isTypingTarget,
    copyText: copyText,
    fallbackCopy: fallbackCopy,
    createEmptySlots: createEmptySlots,
    mount: mount,
  };
});
