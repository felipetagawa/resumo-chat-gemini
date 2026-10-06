function selectorMatches(element, selector) {
  return selector.split(",").some((part) => matchesComplex(element, part.trim()));
}

function matchesComplex(element, selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  let current = element;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (index === parts.length - 1) {
      if (!matchesCompound(current, parts[index])) return false;
      continue;
    }
    current = current.parentElement;
    while (current && !matchesCompound(current, parts[index])) current = current.parentElement;
    if (!current) return false;
  }
  return true;
}

function matchesCompound(element, compound) {
  const attributes = [...compound.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
  if (!attributes.every(([, name, value]) => value == null
    ? element.getAttribute(name) != null : element.getAttribute(name) === value)) return false;
  compound = compound.replace(/\[[^\]]+\]/g, "");
  const tokens = compound.match(/[.#]?[A-Za-z_][\w-]*/g);
  if (!tokens || tokens.join("") !== compound) return false;
  return tokens.every((token) => {
    if (token.startsWith(".")) return element.className.split(/\s+/).filter(Boolean).includes(token.slice(1));
    if (token.startsWith("#")) return element.id === token.slice(1);
    return element.tagName === token.toLowerCase();
  });
}

class MiniNode {
  constructor(tag) {
    this.tagName = String(tag || "div").toLowerCase();
    this.attrs = {};
    this.className = "";
    this.id = "";
    this.children = [];
    this.parentElement = null;
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.type = "";
    this.rows = 0;
    this.style = {};
    this.listeners = {};
  }

  getAttribute(name) {
    if (name === "id") return this.id || null;
    if (name === "class") return this.className || null;
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    if (name === "id") this.id = stringValue;
    else if (name === "class") this.className = stringValue;
    else this.attrs[name] = stringValue;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    this.appendChild(child);
    this.children.unshift(this.children.pop());
  }

  setPointerCapture() {}

  focus() { this.focused = true; }

  contains(node) {
    return node === this || this.children.some(child => child.contains(node));
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((item) => item !== this);
    this.parentElement = null;
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  get innerText() { return this.textContent; }
  set innerText(value) { this.textContent = value; }
  get classList() {
    const self = this;
    return {
      contains(name) { return String(self.className || "").split(/\s+/).includes(name); }
    };
  }
  get parentNode() { return this.parentElement; }

  querySelectorAll(selector) {
    const matches = [];
    const walk = (node) => {
      node.children.forEach((child) => {
        if (selectorMatches(child, selector)) matches.push(child);
        walk(child);
      });
    };
    walk(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  click() {
    return (this.listeners.click || []).map((fn) => fn({ type: "click", target: this }));
  }
}

function el(tag, attrs = {}, children = []) {
  const node = new MiniNode(tag);
  if (attrs.class) node.className = attrs.class;
  if (attrs.id) node.id = attrs.id;
  if (attrs.text != null) node.textContent = attrs.text;
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class" || key === "id" || key === "text") return;
    node.setAttribute(key, value);
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

function descendants(node) {
  const all = [];
  node.children.forEach((child) => {
    all.push(child);
    all.push(...descendants(child));
  });
  return all;
}

function createDocument() {
  const body = new MiniNode("body");
  const listeners = [];
  const document = {
    body,
    hidden: false,
    listeners,
    createElement(tag) {
      return new MiniNode(tag);
    },
    getElementById(id) {
      return descendants(body).find((node) => node.id === id) || null;
    },
    querySelector(selector) {
      return document.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      return descendants(body).filter((node) => selectorMatches(node, selector));
    },
    addEventListener(type, fn) {
      listeners.push({ type, fn });
    }
  };
  return document;
}

function collect(node) {
  return [node, ...node.children.flatMap((child) => collect(child))];
}

function textOf(node) {
  return collect(node).map((item) => item.textContent || "").filter(Boolean).join("\n");
}


module.exports = { MiniNode, el, createDocument, collect, textOf };
