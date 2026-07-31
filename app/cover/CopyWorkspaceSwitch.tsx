"use client";

export default function CopyWorkspaceSwitch() {
  function switchToCopyWorkspace() {
    if (window.opener && !window.opener.closed) {
      window.opener.focus();
      return;
    }

    window.open("/", "nbo-copy-studio");
  }

  return (
    <button type="button" onClick={switchToCopyWorkspace}>
      切换到文案页
    </button>
  );
}
