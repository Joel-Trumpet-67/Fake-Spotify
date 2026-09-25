// Inline SVG icon set (24x24). Stroke icons inherit currentColor; filled ones set fill explicitly.
const F = (d) => `<path fill="currentColor" stroke="none" d="${d}"/>`;

const ICONS = {
  home: F('M12.6 2.4a1 1 0 0 0-1.2 0l-8 6.2A1 1 0 0 0 3 9.4V20a1 1 0 0 0 1 1h5v-6.5h6V21h5a1 1 0 0 0 1-1V9.4a1 1 0 0 0-.4-.8z'),
  'home-o': '<path d="M4 9.5 12 3.3l8 6.2V20h-5v-6.5H9V20H4z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  'search-b': '<circle cx="10.5" cy="10.5" r="6.5" stroke-width="3"/><path d="m15.5 15.5 5 5" stroke-width="3"/>',
  library: '<path d="M5 3.5v17M10 3.5v17M14.5 4.2l5.5 16"/>',
  'library-b': '<path d="M5 3.5v17M10 3.5v17M14.5 4.2l5.5 16" stroke-width="3"/>',
  play: F('M8 4.9v14.2c0 .8.9 1.3 1.6.9l11.3-7.1a1 1 0 0 0 0-1.8L9.6 4c-.7-.4-1.6.1-1.6.9z'),
  pause: F('M6.5 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm8 0h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'),
  next: F('M17 4.5a1 1 0 0 1 2 0v15a1 1 0 0 1-2 0zM4 5.3v13.4c0 .8.9 1.3 1.6.8l10-6.7a1 1 0 0 0 0-1.6l-10-6.7C4.9 4 4 4.5 4 5.3z'),
  prev: F('M7 4.5a1 1 0 0 0-2 0v15a1 1 0 0 0 2 0zM20 5.3v13.4c0 .8-.9 1.3-1.6.8l-10-6.7a1 1 0 0 1 0-1.6l10-6.7c.7-.5 1.6 0 1.6.8z'),
  shuffle: '<path d="M3 17h2.8a4 4 0 0 0 3.3-1.8l5.8-8.4A4 4 0 0 1 18.2 5H21M18 2l3 3-3 3M3 7h2.8a4 4 0 0 1 3.3 1.8l.9 1.3M21 19h-2.8a4 4 0 0 1-3.3-1.8l-.9-1.3M18 16l3 3-3 3"/>',
  repeat: '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/>',
  'repeat-one': '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/><path d="M11 10.5l1.5-1v5.5" stroke-width="1.8"/>',
  heart: '<path d="M12 20.3s-7.3-4.5-9-9C1.8 8 3.9 4.6 7.2 4.6c2 0 3.5 1 4.8 2.7 1.3-1.7 2.8-2.7 4.8-2.7 3.3 0 5.4 3.4 4.2 6.7-1.7 4.5-9 9-9 9z"/>',
  'heart-f': F('M12 21.2a1 1 0 0 1-.5-.1c-.3-.2-7.7-4.8-9.5-9.6C.7 7.6 3.3 3.6 7.2 3.6c1.8 0 3.4.8 4.8 2.2 1.4-1.4 3-2.2 4.8-2.2 3.9 0 6.5 4 5.2 7.9-1.8 4.8-9.2 9.4-9.5 9.6a1 1 0 0 1-.5.1z'),
  more: F('M5 10.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zm7 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zm7 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z'),
  plus: '<path d="M12 5v14M5 12h14"/>',
  'plus-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'check-circle': F('M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm4.3 6.3a1 1 0 0 0-1.4 0l-4.1 4.1-1.7-1.7a1 1 0 1 0-1.4 1.4l2.4 2.4a1 1 0 0 0 1.4 0l4.8-4.8a1 1 0 0 0 0-1.4z'),
  'chevron-left': '<path d="m15 5-7 7 7 7"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  'chevron-down': '<path d="m5 9 7 7 7-7"/>',
  queue: '<path d="M4 6h16M4 11h10M4 16h6M16 13v7l5-3.5z"/>',
  volume: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  'volume-low': '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/>',
  'volume-x': '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>',
  note: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  upload: '<path d="M12 15V4M7 8.5 12 4l5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  'list-add': '<path d="M4 6h13M4 11h13M4 16h7M17 14v6M14 17h6"/>',
  'play-next': '<path d="M4 6h10M4 11h7M4 16h7M15 10v8l6-4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.3-3.6 4.3-5.5 8-5.5s6.7 1.9 8 5.5"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  sort: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0"/>',
  download: '<path d="M12 4v11M7 10.5l5 4.5 5-4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
};

export function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// Replace <span data-icon="name"> placeholders in static markup.
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.outerHTML = icon(el.dataset.icon);
  });
}
