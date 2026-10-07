(() => {
  "use strict";

  const STORAGE_KEY = "exs.scientific-document.v1";
  const PROJECT_VERSION = 1;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const editor = $("#editor");
  const titleInput = $("#documentTitle");
  const saveState = $("#saveState");
  const openInput = $("#openInput");
  const imageInput = $("#imageInput");
  const equationDialog = $("#equationDialog");
  const equationEditor = $("#equationEditor");
  const equationLabel = $("#equationLabel");
  const equationDialogTitle = $("#equationDialogTitle");
  const displayEquationFields = $("#displayEquationFields");
  const findPopover = $("#findPopover");
  const findInput = $("#findInput");
  const findCount = $("#findCount");
  const newDocumentDialog = $("#newDocumentDialog");
  const toast = $("#toast");

  let savedRange = null;
  let equationMode = "display";
  let editingEquation = null;
  let activeMathField = null;
  let activeMathSelection = null;
  let activeMathPosition = null;
  let saveTimer = null;
  let uiRefreshTimer = null;
  let searchRefreshTimer = null;
  let toastTimer = null;
  let searchRanges = [];
  let activeSearchIndex = -1;
  let lastSearchQuery = "";

  const greekSymbols = [
    ["α", "\\alpha"], ["β", "\\beta"], ["γ", "\\gamma"], ["δ", "\\delta"],
    ["ε", "\\epsilon"], ["θ", "\\theta"], ["λ", "\\lambda"], ["μ", "\\mu"],
    ["π", "\\pi"], ["ρ", "\\rho"], ["σ", "\\sigma"], ["φ", "\\phi"],
    ["ψ", "\\psi"], ["ω", "\\omega"], ["Δ", "\\Delta"], ["Ω", "\\Omega"]
  ];

  const scienceSymbols = [
    ["±", "\\pm"], ["∞", "\\infty"], ["≈", "\\approx"], ["≠", "\\ne"],
    ["≤", "\\le"], ["≥", "\\ge"], ["∝", "\\propto"], ["∈", "\\in"],
    ["∇", "\\nabla"], ["·", "\\cdot"], ["×", "\\times"], ["→", "\\to"],
    ["↔", "\\leftrightarrow"], ["ℏ", "\\hbar"], ["ℝ", "\\mathbb{R}"], ["ℂ", "\\mathbb{C}"]
  ];

  function initialDocument() {
    return `
      <h1>Bilimsel Belge</h1>
      <p>EXS; metin, matematik, tablo ve görselleri aynı WYSIWYG çalışma alanında düzenlemek için tasarlanmış web tabanlı bilimsel editördür.</p>
      <h2>Örnek denklem</h2>
      <p>Satır içinde <span class="inline-equation" contenteditable="false"><math-field smart-fence contenteditable="true">E=mc^2</math-field></span> gibi ifadeler kullanılabilir.</p>
      <div class="display-equation" contenteditable="false" data-label="euler">
        <div class="equation-center"><math-field smart-fence contenteditable="true">e^{i\\pi}+1=0</math-field></div>
        <span class="equation-number">(1)</span>
      </div>
      <p>Numaralı denklemler belge yapısında otomatik olarak yeniden sıralanır. Sağ panelden yeni matematik yapıları ekleyebilir veya denklemin içine doğrudan yazabilirsiniz.</p>
    `;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2600);
  }

  function markDirty() {
    saveState.textContent = "Kaydediliyor…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLocal(), 450);
  }

  function saveLocal() {
    const project = serializeProject();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    saveState.textContent = "Kaydedildi";
  }

  function serializeProject() {
    return {
      format: "exs-scientific-document",
      version: PROJECT_VERSION,
      title: titleInput.value.trim() || "Adsız bilimsel belge",
      updatedAt: new Date().toISOString(),
      body: editor.innerHTML
    };
  }

  function loadProject(project) {
    if (!project || project.format !== "exs-scientific-document" || typeof project.body !== "string") {
      throw new Error("Geçerli bir EXS proje dosyası değil.");
    }
    titleInput.value = typeof project.title === "string" ? project.title : "Adsız bilimsel belge";
    editor.innerHTML = sanitizeImportedHtml(project.body);
    normalizeDocument();
    saveLocal();
  }

  function sanitizeImportedHtml(input) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${input}</div>`, "text/html");
    const root = doc.body.firstElementChild;

    const allowedTags = new Set([
      "DIV", "SPAN", "P", "BR", "H1", "H2", "H3", "BLOCKQUOTE",
      "B", "STRONG", "I", "EM", "U", "S", "SUP", "SUB",
      "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
      "IMG", "A", "MATH-FIELD"
    ]);

    const safeClassTokens = new Set([
      "inline-equation", "display-equation", "equation-center", "equation-number"
    ]);

    const walk = (node) => {
      Array.from(node.children).forEach((child) => {
        if (!allowedTags.has(child.tagName)) {
          child.replaceWith(...Array.from(child.childNodes));
          return;
        }

        const className = child.getAttribute("class") || "";
        child.removeAttribute("style");
        Array.from(child.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on")) child.removeAttribute(attr.name);
          if (!["class", "href", "src", "alt", "title", "data-label", "contenteditable", "smart-fence", "math-virtual-keyboard-policy"].includes(name)) {
            child.removeAttribute(attr.name);
          }
        });

        if (className) {
          const safe = className.split(/\s+/).filter((x) => safeClassTokens.has(x));
          if (safe.length) child.setAttribute("class", safe.join(" "));
          else child.removeAttribute("class");
        }

        if (child.tagName === "IMG") {
          const src = child.getAttribute("src") || "";
          if (!/^(data:image\/|https:\/\/|blob:)/i.test(src)) child.removeAttribute("src");
        }

        if (child.tagName === "A") {
          const href = child.getAttribute("href") || "";
          if (!/^(https:\/\/|mailto:|#)/i.test(href)) child.removeAttribute("href");
        }

        walk(child);
      });
    };

    walk(root);
    return root.innerHTML;
  }

  function hideMathVirtualKeyboard() {
    const keyboard = window.mathVirtualKeyboard;
    if (!keyboard) return;

    try {
      if (typeof keyboard.hide === "function") keyboard.hide();
      else if ("visible" in keyboard) keyboard.visible = false;
    } catch {
      // MathLive may not have initialized its shared keyboard yet.
    }
  }

  function configureMathField(field) {
    if (!field) return;

    field.removeAttribute("virtual-keyboard-mode");
    field.setAttribute("math-virtual-keyboard-policy", "manual");

    // If the custom element has already been upgraded, also set the property.
    try {
      if ("mathVirtualKeyboardPolicy" in field) field.mathVirtualKeyboardPolicy = "manual";
    } catch {
      // The attribute above remains the source of truth before upgrade.
    }

    try {
      if ("menuItems" in field) field.menuItems = [];
    } catch {
      // Menu customization is available after the custom element upgrade.
    }

    if (field.dataset.exsKeyboardDisabled !== "1") {
      field.dataset.exsKeyboardDisabled = "1";
      field.addEventListener("focusin", hideMathVirtualKeyboard);
      field.addEventListener("pointerdown", hideMathVirtualKeyboard);
    }
  }

  function cloneMathSelection(selection) {
    if (!selection) return null;
    try {
      return typeof structuredClone === "function"
        ? structuredClone(selection)
        : JSON.parse(JSON.stringify(selection));
    } catch {
      return null;
    }
  }

  function rememberMathContext(field) {
    if (!field || !field.isConnected) return;
    activeMathField = field;

    try {
      activeMathSelection = cloneMathSelection(field.selection);
    } catch {
      activeMathSelection = null;
    }

    try {
      activeMathPosition = Number.isFinite(field.position) ? field.position : null;
    } catch {
      activeMathPosition = null;
    }
  }

  function clearMathContext() {
    activeMathField = null;
    activeMathSelection = null;
    activeMathPosition = null;
  }

  function selectionIsInTextEditor() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer;
    if (!editor.contains(node)) return false;

    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !element?.closest("math-field");
  }

  function getMathTarget() {
    if (equationDialog.open) return equationEditor;

    const focused = document.activeElement;

    // A genuinely focused MathLive field always wins.
    if (
      focused &&
      focused.tagName === "MATH-FIELD" &&
      editor.contains(focused)
    ) {
      rememberMathContext(focused);
      return focused;
    }

    // Normal contenteditable text selection/caret must never be hijacked by
    // a previously focused math-field kept in memory.
    if (focused === editor || selectionIsInTextEditor()) {
      clearMathContext();
      return null;
    }

    // Never route a toolbar command to a stale math field. Toolbar buttons
    // prevent pointer focus changes, so an actually active MathLive field
    // remains document.activeElement and was handled above.
    return null;
  }

  function restoreMathContext(field) {
    if (!field) return;

    field.focus();

    try {
      if (activeMathSelection) {
        field.selection = cloneMathSelection(activeMathSelection);
      } else if (Number.isFinite(activeMathPosition)) {
        field.position = activeMathPosition;
      }
    } catch {
      // If a saved range became invalid after an edit, MathLive keeps its current caret.
    }
  }

  function isWhitespaceTextNode(node) {
    return node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim();
  }

  function isStandaloneInlineEquation(wrapper) {
    const parent = wrapper?.parentElement;
    if (!parent || parent.tagName !== "P") return false;

    return Array.from(parent.childNodes).every((node) => {
      if (node === wrapper) return true;
      if (isWhitespaceTextNode(node)) return true;
      return node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR";
    });
  }

  function buildDisplayEquationFromField(field) {
    const wrapper = document.createElement("div");
    wrapper.className = "display-equation";
    wrapper.setAttribute("contenteditable", "false");

    const center = document.createElement("div");
    center.className = "equation-center";
    center.append(field);

    const number = document.createElement("span");
    number.className = "equation-number";

    wrapper.append(center, number);
    return wrapper;
  }

  function promoteStandaloneInlineMath() {
    const standalone = Array.from(editor.querySelectorAll(".inline-equation"))
      .filter(isStandaloneInlineEquation);

    standalone.forEach((inlineWrapper) => {
      const parent = inlineWrapper.parentElement;
      const field = inlineWrapper.querySelector("math-field");
      if (!parent || !field) return;

      const display = buildDisplayEquationFromField(field);
      parent.replaceWith(display);
    });
  }

  function normalizeDocument() {
    promoteStandaloneInlineMath();
    attachMathFieldListeners();
    renumberEquations();
    updateOutline();
    updateStats();
  }

  function scheduleDocumentRefresh(delay = 120) {
    clearTimeout(uiRefreshTimer);
    uiRefreshTimer = setTimeout(() => {
      normalizeDocument();
    }, delay);
  }

  function attachMathFieldListeners() {
    editor.querySelectorAll("math-field").forEach((field) => {
      configureMathField(field);
      if (field.dataset.exsBound === "1") return;
      field.dataset.exsBound = "1";
      field.addEventListener("focus", () => {
        rememberMathContext(field);
        hideMathVirtualKeyboard();
      });
      field.addEventListener("focusin", () => {
        rememberMathContext(field);
        hideMathVirtualKeyboard();
      });
      field.addEventListener("pointerdown", () => {
        activeMathField = field;
        requestAnimationFrame(() => rememberMathContext(field));
      });
      field.addEventListener("selection-change", () => {
        rememberMathContext(field);
      });
      field.addEventListener("input", () => {
        rememberMathContext(field);
        markDirty();
        scheduleDocumentRefresh(140);
      });
      field.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        const display = field.closest(".display-equation");
        openEquationDialog(display ? "display" : "inline", field);
      });
    });
  }

  function renumberEquations() {
    const equations = Array.from(editor.querySelectorAll(".display-equation"));
    equations.forEach((equation, index) => {
      equation.dataset.eqNo = String(index + 1);
      let number = equation.querySelector(".equation-number");
      if (!number) {
        number = document.createElement("span");
        number.className = "equation-number";
        equation.append(number);
      }
      number.textContent = `(${index + 1})`;
    });
    $("#equationCount").textContent = `${equations.length} denklem`;
    updateEquationList(equations);
  }

  function updateEquationList(equations = Array.from(editor.querySelectorAll(".display-equation"))) {
    const panel = $("#equationsPanel");
    panel.innerHTML = "";
    if (!equations.length) {
      panel.innerHTML = '<div class="empty-state">Henüz numaralı denklem yok.</div>';
      return;
    }

    equations.forEach((equation, index) => {
      const button = document.createElement("button");
      button.className = "equation-item";
      const label = equation.dataset.label ? ` · ${equation.dataset.label}` : "";
      const field = equation.querySelector("math-field");
      const latex = getMathValue(field).replace(/\s+/g, " ").slice(0, 42);
      button.innerHTML = `<span class="equation-number-pill">(${index + 1})</span><span>${escapeHtml(latex || "denklem")}${escapeHtml(label)}</span>`;
      button.addEventListener("click", () => equation.scrollIntoView({ behavior: "smooth", block: "center" }));
      panel.append(button);
    });
  }

  function updateOutline() {
    const panel = $("#outlinePanel");
    const headings = Array.from(editor.querySelectorAll("h1,h2,h3"));
    panel.innerHTML = "";
    if (!headings.length) {
      panel.innerHTML = '<div class="empty-state">Başlık eklediğinizde belge yapısı burada görünür.</div>';
      return;
    }
    headings.forEach((heading) => {
      const button = document.createElement("button");
      button.className = `outline-item level-${heading.tagName.slice(1)}`;
      button.textContent = heading.textContent.trim() || "Adsız başlık";
      button.addEventListener("click", () => heading.scrollIntoView({ behavior: "smooth", block: "center" }));
      panel.append(button);
    });
  }

  function updateStats() {
    const clone = editor.cloneNode(true);
    clone.querySelectorAll("math-field").forEach((field) => {
      field.replaceWith(document.createTextNode(` ${getMathValue(field)} `));
    });
    const text = clone.textContent.replace(/\s+/g, " ").trim();
    const words = text ? text.split(" ").filter(Boolean).length : 0;
    $("#wordCount").textContent = `${words} kelime`;
    $("#charCount").textContent = `${text.length} karakter`;
  }

  function getMathValue(field) {
    if (!field) return "";
    if (typeof field.getValue === "function") return field.getValue("latex");
    if (typeof field.value === "string") return field.value;
    return field.textContent || "";
  }

  function setMathValue(field, latex) {
    if (!field) return;
    if ("value" in field) field.value = latex;
    else field.textContent = latex;
  }

  function saveSelection() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    const node = range.commonAncestorContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

    if (!element?.closest("math-field")) {
      savedRange = range.cloneRange();
      clearMathContext();
    }
  }

  function restoreSelection() {
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    if (savedRange) {
      selection.addRange(savedRange);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
  }

  function insertNodeAtSelection(node) {
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      editor.append(node);
      return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
    normalizeDocument();
    markDirty();
  }

  function openEquationDialog(mode, existingField = null) {
    saveSelection();
    equationMode = mode;
    editingEquation = existingField;
    equationDialogTitle.textContent = existingField
      ? "Denklemi düzenle"
      : mode === "display" ? "Numaralı denklem ekle" : "Satır içi matematik ekle";
    displayEquationFields.hidden = mode !== "display";
    equationLabel.value = existingField?.closest(".display-equation")?.dataset.label || "";
    setMathValue(equationEditor, existingField ? getMathValue(existingField) : "");
    equationDialog.showModal();
    setTimeout(() => equationEditor.focus(), 40);
  }

  function commitEquation() {
    const latex = getMathValue(equationEditor).trim();
    if (!latex) {
      showToast("Denklem boş olamaz.");
      return false;
    }

    if (editingEquation) {
      setMathValue(editingEquation, latex);
      const display = editingEquation.closest(".display-equation");
      if (display) {
        const label = equationLabel.value.trim();
        if (label) display.dataset.label = label;
        else delete display.dataset.label;
      }
      editingEquation = null;
      normalizeDocument();
      markDirty();
      return true;
    }

    if (equationMode === "inline") {
      const wrapper = document.createElement("span");
      wrapper.className = "inline-equation";
      wrapper.setAttribute("contenteditable", "false");
      const field = document.createElement("math-field");
      field.setAttribute("smart-fence", "");
      field.setAttribute("contenteditable", "true");
      field.textContent = latex;
      wrapper.append(field);
      insertNodeAtSelection(wrapper);
    } else {
      const wrapper = document.createElement("div");
      wrapper.className = "display-equation";
      wrapper.setAttribute("contenteditable", "false");
      const label = equationLabel.value.trim();
      if (label) wrapper.dataset.label = label;

      const center = document.createElement("div");
      center.className = "equation-center";
      const field = document.createElement("math-field");
      field.setAttribute("smart-fence", "");
      field.setAttribute("contenteditable", "true");
      field.textContent = latex;
      center.append(field);

      const number = document.createElement("span");
      number.className = "equation-number";
      wrapper.append(center, number);
      insertNodeAtSelection(wrapper);

      const paragraph = document.createElement("p");
      paragraph.innerHTML = "<br>";
      wrapper.after(paragraph);
    }
    return true;
  }

  function focusMathField(field) {
    requestAnimationFrame(() => {
      activeMathField = field;
      field.focus();
      rememberMathContext(field);
      if (typeof field.executeCommand === "function") {
        try {
          field.executeCommand("moveToNextPlaceholder");
        } catch {
          // MathLive versions may expose placeholder navigation differently.
        }
      }
    });
  }

  function getInsertionParagraph() {
    const range = savedRange;
    if (!range) return null;

    const node = range.startContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const paragraph = element?.closest("p");

    return paragraph && editor.contains(paragraph) ? paragraph : null;
  }

  function isEmptyParagraph(paragraph) {
    if (!paragraph || paragraph.tagName !== "P") return false;

    return Array.from(paragraph.childNodes).every((node) => {
      if (isWhitespaceTextNode(node)) return true;
      return node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR";
    });
  }

  function createDisplayMathInParagraph(paragraph, latex = "\\placeholder{}") {
    const field = document.createElement("math-field");
    field.setAttribute("smart-fence", "");
    field.setAttribute("contenteditable", "true");
    field.setAttribute("math-virtual-keyboard-policy", "manual");
    field.textContent = latex;

    const wrapper = buildDisplayEquationFromField(field);
    paragraph.replaceWith(wrapper);

    const nextParagraph = document.createElement("p");
    nextParagraph.innerHTML = "<br>";
    wrapper.after(nextParagraph);

    normalizeDocument();
    markDirty();
    focusMathField(field);
    return field;
  }

  function createInlineMath(latex = "\\placeholder{}") {
    const wrapper = document.createElement("span");
    wrapper.className = "inline-equation";
    wrapper.setAttribute("contenteditable", "false");

    const field = document.createElement("math-field");
    field.setAttribute("smart-fence", "");
    field.setAttribute("contenteditable", "true");
    field.setAttribute("math-virtual-keyboard-policy", "manual");
    field.textContent = latex;

    wrapper.append(field);
    insertNodeAtSelection(wrapper);
    attachMathFieldListeners();
    focusMathField(field);
    return field;
  }

  function createDisplayMath(latex = "\\placeholder{}") {
    const paragraph = getInsertionParagraph();
    if (paragraph && isEmptyParagraph(paragraph)) {
      return createDisplayMathInParagraph(paragraph, latex);
    }

    const field = document.createElement("math-field");
    field.setAttribute("smart-fence", "");
    field.setAttribute("contenteditable", "true");
    field.setAttribute("math-virtual-keyboard-policy", "manual");
    field.textContent = latex;

    const wrapper = buildDisplayEquationFromField(field);
    insertNodeAtSelection(wrapper);

    const paragraphAfter = document.createElement("p");
    paragraphAfter.innerHTML = "<br>";
    wrapper.after(paragraphAfter);

    normalizeDocument();
    focusMathField(field);
    return field;
  }

  function insertLatex(latex) {
    const candidate = getMathTarget();

    if (candidate && typeof candidate.insert === "function") {
      restoreMathContext(candidate);
      candidate.insert(latex, {
        insertionMode: "replaceSelection",
        selectionMode: "placeholder"
      });
      candidate.focus();
      rememberMathContext(candidate);
      markDirty();
      scheduleDocumentRefresh(80);
      return;
    }

    const paragraph = getInsertionParagraph();
    if (paragraph && isEmptyParagraph(paragraph)) {
      createDisplayMathInParagraph(paragraph, latex);
      return;
    }

    createInlineMath(latex);
  }

  function insertTable() {
    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    for (let r = 0; r < 3; r += 1) {
      const tr = document.createElement("tr");
      for (let c = 0; c < 3; c += 1) {
        const cell = document.createElement(r === 0 ? "th" : "td");
        cell.innerHTML = r === 0 ? `Sütun ${c + 1}` : "<br>";
        tr.append(cell);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    insertNodeAtSelection(table);
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<br>";
    table.after(paragraph);
  }

  function insertImage(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Lütfen bir görsel dosyası seçin.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Yerel proje boyutunu korumak için 5 MB'tan küçük görsel kullanın.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement("img");
      img.src = String(reader.result);
      img.alt = file.name;
      insertNodeAtSelection(img);
      const paragraph = document.createElement("p");
      paragraph.innerHTML = "<br>";
      img.after(paragraph);
    };
    reader.readAsDataURL(file);
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeBaseName() {
    return (titleInput.value.trim() || "scientific-document")
      .toLocaleLowerCase("tr-TR")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "scientific-document";
  }

  function exportProject() {
    const content = JSON.stringify(serializeProject(), null, 2);
    download(`${safeBaseName()}.exs`, content, "application/json;charset=utf-8");
    saveLocal();
    showToast("EXS proje dosyası indirildi.");
  }

  function exportHtml() {
    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(titleInput.value)}</title>
<script defer src="https://cdn.jsdelivr.net/npm/mathlive"><\/script>
<style>
body{max-width:800px;margin:40px auto;padding:0 24px;font:16px/1.6 "Times New Roman",serif;color:#111}
h1,h2,h3{font-family:Arial,sans-serif}.display-equation{display:grid;grid-template-columns:1fr auto;align-items:center}
.equation-center{display:flex;justify-content:center}math-field{border:0;background:transparent}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px}img{max-width:100%}
</style>
</head>
<body>
<h1>${escapeHtml(titleInput.value)}</h1>
${editor.innerHTML}
</body></html>`;
    download(`${safeBaseName()}.html`, html, "text/html;charset=utf-8");
  }

  function exportText() {
    const clone = editor.cloneNode(true);
    clone.querySelectorAll("math-field").forEach((field) => {
      field.replaceWith(document.createTextNode(` $${getMathValue(field)}$ `));
    });
    download(`${safeBaseName()}.txt`, clone.innerText, "text/plain;charset=utf-8");
  }

  function exportLatex() {
    const body = nodesToLatex(Array.from(editor.childNodes));
    const tex = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{hyperref}
\\title{${escapeLatex(titleInput.value.trim() || "Scientific Document")}}
\\date{}

\\begin{document}
\\maketitle

${body}

\\end{document}
`;
    download(`${safeBaseName()}.tex`, tex, "application/x-tex;charset=utf-8");
  }

  function nodesToLatex(nodes) {
    return nodes.map(nodeToLatex).join("");
  }

  function nodeToLatex(node) {
    if (node.nodeType === Node.TEXT_NODE) return escapeLatex(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();
    if (tag === "math-field") return getMathValue(node);
    if (node.classList.contains("inline-equation")) {
      const field = node.querySelector("math-field");
      return `$${getMathValue(field)}$`;
    }
    if (node.classList.contains("display-equation")) {
      const field = node.querySelector("math-field");
      const label = node.dataset.label ? `\\label{eq:${escapeLatexLabel(node.dataset.label)}}` : "";
      return `\n\\begin{equation}\n${getMathValue(field)}${label}\n\\end{equation}\n\n`;
    }

    const inner = nodesToLatex(Array.from(node.childNodes));
    switch (tag) {
      case "h1": return `\\section{${inner}}\n`;
      case "h2": return `\\subsection{${inner}}\n`;
      case "h3": return `\\subsubsection{${inner}}\n`;
      case "p": return `${inner}\n\n`;
      case "br": return "\n";
      case "strong":
      case "b": return `\\textbf{${inner}}`;
      case "em":
      case "i": return `\\textit{${inner}}`;
      case "u": return `\\underline{${inner}}`;
      case "sup": return `\\textsuperscript{${inner}}`;
      case "sub": return `\\textsubscript{${inner}}`;
      case "blockquote": return `\\begin{quote}\n${inner}\\end{quote}\n`;
      case "ul": return `\\begin{itemize}\n${inner}\\end{itemize}\n`;
      case "ol": return `\\begin{enumerate}\n${inner}\\end{enumerate}\n`;
      case "li": return `\\item ${inner}\n`;
      case "table": return tableToLatex(node);
      case "img": return `% Görsel: ${escapeLatex(node.getAttribute("alt") || "embedded image")} — EXS HTML/JSON dışa aktarımında gömülü tutulur.\n`;
      case "a": {
        const href = node.getAttribute("href") || "";
        return href.startsWith("https://") ? `\\href{${escapeLatexUrl(href)}}{${inner}}` : inner;
      }
      default: return inner;
    }
  }

  function tableToLatex(table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (!rows.length) return "";
    const columns = Math.max(...rows.map((row) => row.children.length));
    const spec = "l".repeat(columns);
    const body = rows.map((row, rowIndex) => {
      const cells = Array.from(row.children).map((cell) => nodesToLatex(Array.from(cell.childNodes)).trim());
      const line = `${cells.join(" & ")} \\\\`;
      return rowIndex === 0 ? `${line}\n\\midrule` : line;
    }).join("\n");
    return `\n\\begin{center}\n\\begin{tabular}{${spec}}\n\\toprule\n${body}\n\\bottomrule\n\\end{tabular}\n\\end{center}\n\n`;
  }

  function escapeLatex(value) {
    const map = {
      "\\": "\\textbackslash{}",
      "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&", "#": "\\#",
      "%": "\\%", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}"
    };
    return String(value).replace(/[\\{}$&#%_^~]/g, (char) => map[char] || char);
  }

  function escapeLatexUrl(value) {
    return String(value).replace(/[{}\\]/g, "");
  }

  function escapeLatexLabel(value) {
    return String(value).trim().replace(/[^A-Za-z0-9:._-]+/g, "-");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function populatePalette(element, values) {
    values.forEach(([symbol, latex]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = symbol;
      button.title = latex;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => insertLatex(latex));
      element.append(button);
    });
  }

  function runCommand(command, value = null) {
    restoreSelection();
    document.execCommand(command, false, value);
    saveSelection();
    markDirty();
    updateStats();
    updateOutline();
  }

  function clearSearchHighlights() {
    if ("highlights" in CSS) {
      CSS.highlights.delete("exs-search");
      CSS.highlights.delete("exs-search-active");
    }
  }

  function collectSearchRanges(query) {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return [];

    const ranges = [];
    const walker = document.createTreeWalker(
      editor,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest("math-field")) return NodeFilter.FILTER_REJECT;
          if (parent.closest(".equation-number")) return NodeFilter.FILTER_REJECT;
          return (node.nodeValue || "").trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue || "";
      const haystack = text.toLocaleLowerCase("tr-TR");
      let from = 0;

      while (from <= haystack.length - needle.length) {
        const index = haystack.indexOf(needle, from);
        if (index < 0) break;

        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        ranges.push(range);

        from = index + Math.max(needle.length, 1);
      }
    }

    return ranges;
  }

  function renderSearchHighlights() {
    clearSearchHighlights();

    if (
      !searchRanges.length ||
      !("highlights" in CSS) ||
      typeof Highlight === "undefined"
    ) {
      return;
    }

    const passive = searchRanges.filter((_, index) => index !== activeSearchIndex);
    if (passive.length) {
      CSS.highlights.set("exs-search", new Highlight(...passive));
    }

    if (activeSearchIndex >= 0 && searchRanges[activeSearchIndex]) {
      CSS.highlights.set(
        "exs-search-active",
        new Highlight(searchRanges[activeSearchIndex])
      );
    }
  }

  function updateFindCount() {
    findCount.textContent = searchRanges.length
      ? `${activeSearchIndex + 1} / ${searchRanges.length}`
      : "0 / 0";
  }

  function scrollActiveSearchMatch() {
    const range = searchRanges[activeSearchIndex];
    if (!range) return;

    const node = range.startContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    element?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }

  function refreshSearchHighlights(scrollActive = false) {
    const query = findInput.value;
    const queryChanged = query !== lastSearchQuery;
    lastSearchQuery = query;

    searchRanges = collectSearchRanges(query);

    if (!searchRanges.length) {
      activeSearchIndex = -1;
    } else if (queryChanged || activeSearchIndex < 0) {
      activeSearchIndex = 0;
    } else {
      activeSearchIndex = Math.min(activeSearchIndex, searchRanges.length - 1);
    }

    renderSearchHighlights();
    updateFindCount();

    if (scrollActive && activeSearchIndex >= 0) scrollActiveSearchMatch();
  }

  function scheduleSearchRefresh(delay = 70) {
    clearTimeout(searchRefreshTimer);
    searchRefreshTimer = setTimeout(() => {
      if (!findPopover.hidden) refreshSearchHighlights(false);
    }, delay);
  }

  function navigateSearch(direction) {
    if (!searchRanges.length) return;

    activeSearchIndex =
      (activeSearchIndex + direction + searchRanges.length) % searchRanges.length;

    renderSearchHighlights();
    updateFindCount();
    scrollActiveSearchMatch();
  }

  function positionFindPopover() {
    if (findPopover.hidden) return;

    const button = $("#findButton");
    const rect = button.getBoundingClientRect();
    const width = findPopover.offsetWidth || 430;
    const left = Math.max(10, Math.min(rect.right - width, window.innerWidth - width - 10));

    findPopover.style.top = `${rect.bottom + 6}px`;
    findPopover.style.left = `${left}px`;
  }

  function openFindPopover() {
    findPopover.hidden = false;
    $("#findButton").setAttribute("aria-expanded", "true");

    requestAnimationFrame(() => {
      positionFindPopover();
      findInput.focus();
      findInput.select();
      refreshSearchHighlights(false);
    });
  }

  function closeFindPopover() {
    findPopover.hidden = true;
    $("#findButton").setAttribute("aria-expanded", "false");
    clearSearchHighlights();
  }

  function toggleFindPopover() {
    if (findPopover.hidden) openFindPopover();
    else closeFindPopover();
  }

  function replaceActiveSearchMatch() {
    const range = searchRanges[activeSearchIndex];
    if (!range) return false;

    const replacement = $("#replaceInput").value;
    range.deleteContents();
    range.insertNode(document.createTextNode(replacement));

    markDirty();
    normalizeDocument();
    refreshSearchHighlights(true);
    return true;
  }

  function replaceAllSearchMatches() {
    if (!searchRanges.length) return 0;

    const replacement = $("#replaceInput").value;
    const count = searchRanges.length;

    for (let index = searchRanges.length - 1; index >= 0; index -= 1) {
      const range = searchRanges[index];
      range.deleteContents();
      range.insertNode(document.createTextNode(replacement));
    }

    markDirty();
    normalizeDocument();
    refreshSearchHighlights(false);
    return count;
  }

  populatePalette($("#greekPalette"), greekSymbols);
  populatePalette($("#symbolPalette"), scienceSymbols);

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      loadProject(JSON.parse(saved));
    } catch {
      editor.innerHTML = initialDocument();
      normalizeDocument();
    }
  } else {
    editor.innerHTML = initialDocument();
    normalizeDocument();
  }

  editor.addEventListener("input", () => {
    saveSelection();
    scheduleDocumentRefresh();
    scheduleSearchRefresh();
    markDirty();
  });

  editor.addEventListener("keyup", saveSelection);
  editor.addEventListener("mouseup", saveSelection);
  editor.addEventListener("focusout", saveSelection);
  editor.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("math-field")) clearMathContext();
  });

  titleInput.addEventListener("input", markDirty);

  $$("#greekPalette button, #symbolPalette button, .template-grid button, #mathToolbar button").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      const mathTarget = getMathTarget();
      if (mathTarget) rememberMathContext(mathTarget);
      else saveSelection();
      event.preventDefault();
    });
  });

  $$(".template-grid button, #mathToolbar [data-latex]").forEach((button) => {
    button.addEventListener("click", () => insertLatex(button.dataset.latex || ""));
  });

  function runContextAwareCommand(command) {
    const candidate = getMathTarget();

    if (candidate) {
      restoreMathContext(candidate);

      if (command === "superscript" && typeof candidate.executeCommand === "function") {
        const moved = candidate.executeCommand("moveToSuperscript");
        if (!moved && typeof candidate.insert === "function") {
          candidate.insert("^{\\placeholder{}}", { selectionMode: "placeholder" });
        }
        candidate.focus();
        rememberMathContext(candidate);
        markDirty();
        scheduleDocumentRefresh(80);
        return;
      }

      if (command === "subscript" && typeof candidate.executeCommand === "function") {
        const moved = candidate.executeCommand("moveToSubscript");
        if (!moved && typeof candidate.insert === "function") {
          candidate.insert("_{\\placeholder{}}", { selectionMode: "placeholder" });
        }
        candidate.focus();
        rememberMathContext(candidate);
        markDirty();
        scheduleDocumentRefresh(80);
        return;
      }

      if (command === "bold" && typeof candidate.applyStyle === "function") {
        candidate.applyStyle({ fontSeries: "b" }, { operation: "toggle" });
        candidate.focus();
        rememberMathContext(candidate);
        markDirty();
        return;
      }

      if (command === "italic" && typeof candidate.applyStyle === "function") {
        candidate.applyStyle({ fontShape: "it" }, { operation: "toggle" });
        candidate.focus();
        rememberMathContext(candidate);
        markDirty();
        return;
      }

      if (command === "underline" && typeof candidate.insert === "function") {
        const content = candidate.selectionIsCollapsed
          ? "\\underline{\\placeholder{}}"
          : "\\underline{#0}";
        candidate.insert(content, {
          insertionMode: "replaceSelection",
          selectionMode: candidate.selectionIsCollapsed ? "placeholder" : "item"
        });
        candidate.focus();
        rememberMathContext(candidate);
        markDirty();
        scheduleDocumentRefresh(80);
        return;
      }
    }

    runCommand(command);
  }

  $$("[data-command]").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      const focused = document.activeElement;

      if (
        focused &&
        focused.tagName === "MATH-FIELD" &&
        editor.contains(focused)
      ) {
        rememberMathContext(focused);
      } else {
        saveSelection();
      }

      event.preventDefault();
    });

    button.addEventListener("click", () => runContextAwareCommand(button.dataset.command));
  });

  $("#blockStyle").addEventListener("change", (event) => {
    runCommand("formatBlock", event.target.value);
  });

  $$("[data-menu-action]").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      const mathTarget = getMathTarget();
      if (mathTarget) rememberMathContext(mathTarget);
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      const action = button.dataset.menuAction;
      const mathTarget = getMathTarget();

      if (
        mathTarget &&
        typeof mathTarget.executeCommand === "function" &&
        (action === "undo" || action === "redo")
      ) {
        restoreMathContext(mathTarget);
        mathTarget.executeCommand(action);
        mathTarget.focus();
        rememberMathContext(mathTarget);
        scheduleDocumentRefresh(80);
        return;
      }

      if (action === "undo") runCommand("undo");
      if (action === "redo") runCommand("redo");
    });
  });

  $("#inlineMathButton").addEventListener("mousedown", (event) => {
    saveSelection();
    event.preventDefault();
  });
  $("#inlineMathButton").addEventListener("click", () => insertLatex("\\placeholder{}"));

  $("#displayMathButton").addEventListener("mousedown", (event) => {
    saveSelection();
    event.preventDefault();
  });
  $("#displayMathButton").addEventListener("click", () => createDisplayMath("\\placeholder{}"));

  $("#equationForm").addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") {
      editingEquation = null;
      return;
    }
    event.preventDefault();
    if (commitEquation()) equationDialog.close();
  });

  equationDialog.addEventListener("close", () => {
    editingEquation = null;
    setMathValue(equationEditor, "");
    equationLabel.value = "";
  });

  $("#tableButton").addEventListener("mousedown", saveSelection);
  $("#tableButton").addEventListener("click", insertTable);

  $("#imageButton").addEventListener("mousedown", saveSelection);
  $("#imageButton").addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", () => {
    insertImage(imageInput.files?.[0]);
    imageInput.value = "";
  });

  $("#saveButton").addEventListener("click", exportProject);

  const closeNewDocumentDialog = () => {
    if (newDocumentDialog.open) newDocumentDialog.close();
  };

  $("#newButton").addEventListener("click", () => {
    newDocumentDialog.showModal();
  });

  $("#newDocumentCloseButton").addEventListener("click", closeNewDocumentDialog);
  $("#newDocumentCancelButton").addEventListener("click", closeNewDocumentDialog);

  newDocumentDialog.addEventListener("click", (event) => {
    if (event.target === newDocumentDialog) closeNewDocumentDialog();
  });

  $("#newDocumentConfirmButton").addEventListener("click", () => {
    titleInput.value = "Adsız bilimsel belge";
    editor.innerHTML = "<h1>Bilimsel Belge</h1><p><br></p>";
    closeFindPopover();
    findInput.value = "";
    $("#replaceInput").value = "";
    lastSearchQuery = "";
    searchRanges = [];
    activeSearchIndex = -1;
    updateFindCount();
    normalizeDocument();
    saveLocal();
    closeNewDocumentDialog();
    editor.focus();
  });

  $("#openButton").addEventListener("click", () => openInput.click());
  openInput.addEventListener("change", async () => {
    const file = openInput.files?.[0];
    if (!file) return;
    try {
      const project = JSON.parse(await file.text());
      loadProject(project);
      showToast("Proje açıldı.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Dosya açılamadı.");
    } finally {
      openInput.value = "";
    }
  });

  $("#printButton").addEventListener("click", () => window.print());

  $("#exportButton").addEventListener("click", () => {
    const popover = $("#exportPopover");
    popover.hidden = !popover.hidden;
  });

  $$("[data-export]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#exportPopover").hidden = true;
      const format = button.dataset.export;
      if (format === "latex") exportLatex();
      if (format === "html") exportHtml();
      if (format === "text") exportText();
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".export-menu")) $("#exportPopover").hidden = true;
  });

  $("#findButton").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFindPopover();
  });

  findPopover.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  findInput.addEventListener("input", () => {
    refreshSearchHighlights(true);
  });

  findInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      navigateSearch(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeFindPopover();
      $("#findButton").focus();
    }
  });

  $("#findPrevButton").addEventListener("click", () => navigateSearch(-1));
  $("#findNextButton").addEventListener("click", () => navigateSearch(1));
  $("#findCloseButton").addEventListener("click", closeFindPopover);

  $("#replaceButton").addEventListener("click", () => {
    const ok = replaceActiveSearchMatch();
    showToast(ok ? "Eşleşme değiştirildi." : "Eşleşme bulunamadı.");
  });

  $("#replaceAllButton").addEventListener("click", () => {
    const count = replaceAllSearchMatches();
    showToast(`${count} eşleşme değiştirildi.`);
  });

  document.addEventListener("click", () => {
    if (!findPopover.hidden) closeFindPopover();
  });

  window.addEventListener("resize", positionFindPopover);

  $$(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
      $("#outlinePanel").hidden = button.dataset.tab !== "outline";
      $("#equationsPanel").hidden = button.dataset.tab !== "equations";
    });
  });

  document.addEventListener("keydown", (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "s") {
      event.preventDefault();
      exportProject();
    }
    if (modifier && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openFindPopover();
    }
    if (modifier && event.shiftKey && event.key.toLowerCase() === "m") {
      event.preventDefault();
      openEquationDialog("display");
    }
  });

  window.addEventListener("beforeunload", saveLocal);
  window.addEventListener("load", () => {
    configureMathField(equationEditor);
    attachMathFieldListeners();
    normalizeDocument();
    hideMathVirtualKeyboard();
    saveLocal();
  });
})();
