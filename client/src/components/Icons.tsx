// Small line icons for the icon buttons.

// A panel with a sidebar: opens or folds the chat list.
export function PanelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </svg>
  );
}

// An arrow pointing down: jumps to the newest message.
export function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}
