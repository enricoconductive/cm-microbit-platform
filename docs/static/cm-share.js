// CM Share: URL-based project sharing for static MakeCode deployment
// Encodes project data directly in the share URL — no backend needed.
(function () {
  "use strict";

  var SHARE_PREFIX = "#share:";
  var EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

  // Simple string compression using built-in CompressionStream where available,
  // falling back to raw base64 encoding.
  async function compressString(str) {
    if (typeof CompressionStream !== "undefined") {
      var cs = new CompressionStream("gzip");
      var writer = cs.writable.getWriter();
      writer.write(new TextEncoder().encode(str));
      writer.close();
      var reader = cs.readable.getReader();
      var chunks = [];
      while (true) {
        var result = await reader.read();
        if (result.done) break;
        chunks.push(result.value);
      }
      var totalLen = chunks.reduce(function (a, c) { return a + c.length; }, 0);
      var merged = new Uint8Array(totalLen);
      var offset = 0;
      chunks.forEach(function (c) { merged.set(c, offset); offset += c.length; });
      return btoa(String.fromCharCode.apply(null, merged));
    }
    return btoa(unescape(encodeURIComponent(str)));
  }

  async function decompressString(encoded) {
    if (typeof DecompressionStream !== "undefined") {
      try {
        var raw = Uint8Array.from(atob(encoded), function (c) { return c.charCodeAt(0); });
        var ds = new DecompressionStream("gzip");
        var writer = ds.writable.getWriter();
        writer.write(raw);
        writer.close();
        var reader = ds.readable.getReader();
        var chunks = [];
        while (true) {
          var result = await reader.read();
          if (result.done) break;
          chunks.push(result.value);
        }
        var totalLen = chunks.reduce(function (a, c) { return a + c.length; }, 0);
        var merged = new Uint8Array(totalLen);
        var offset = 0;
        chunks.forEach(function (c) { merged.set(c, offset); offset += c.length; });
        return new TextDecoder().decode(merged);
      } catch (e) { /* fall through */ }
    }
    return decodeURIComponent(escape(atob(encoded)));
  }

  // Build a shareable URL with project data embedded in the hash
  function buildShareUrl(projectData) {
    var expiry = Date.now() + EXPIRY_MS;
    var payload = JSON.stringify({ d: projectData, e: expiry, v: 1 });
    return compressString(payload).then(function (compressed) {
      var base = window.location.origin + window.location.pathname;
      return base + SHARE_PREFIX + compressed;
    });
  }

  // Decode a share URL back to project data
  async function decodeShareUrl(url) {
    var hashIndex = url.indexOf(SHARE_PREFIX);
    if (hashIndex === -1) return null;
    var encoded = url.substring(hashIndex + SHARE_PREFIX.length);
    var payload = JSON.parse(await decompressString(encoded));
    if (payload.e && payload.e < Date.now()) {
      throw new Error("This share link has expired.");
    }
    return payload.d;
  }

  // Intercept the MakeCode share flow
  function installShareInterceptor() {
    // Watch for the share dialog to appear and modify its behavior
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          // Look for the share dialog
          var shareDialog = node.querySelector
            ? (node.matches && node.matches(".share-dialog") ? node : node.querySelector(".share-dialog"))
            : null;
          if (!shareDialog) return;
          modifyShareDialog(shareDialog);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function modifyShareDialog(dialog) {
    // Find the publish/share button in the dialog
    var publishBtn = dialog.querySelector(".share-publish-button, .primary.button, button.primary");
    if (!publishBtn) return;

    // Replace the click handler
    publishBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      handleShare();
    }, true);
  }

  async function handleShare() {
    try {
      // Access the pxt editor API
      var editor = window.pxtApp && window.pxtApp.editor;
      if (!editor && window.pxt) {
        // Try alternative access
        editor = window.currentEditor;
      }

      if (!editor) {
        showShareFallback();
        return;
      }

      // Get the current project header
      var header = editor.state && editor.state.header;
      if (!header) {
        showShareFallback();
        return;
      }

      // Use the pxt API to get project files
      var files = await editor.projectController.getFilesAsync
        ? await editor.projectController.getFilesAsync(header)
        : null;

      if (!files) {
        showShareFallback();
        return;
      }

      var projectData = {
        header: {
          id: header.id,
          name: header.name || "Untitled",
          editor: header.editor || "blocks",
          target: "microbit"
        },
        files: {}
      };

      for (var key in files) {
        if (files.hasOwnProperty(key)) {
          projectData.files[key] = typeof files[key] === "string"
            ? files[key]
            : new TextDecoder().decode(files[key]);
        }
      }

      var shareUrl = await buildShareUrl(projectData);
      showShareResult(shareUrl, header.name);
    } catch (err) {
      console.error("CM Share error:", err);
      showShareFallback();
    }
  }

  function showShareResult(url, projectName) {
    // Create a custom share modal
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;";

    var modal = document.createElement("div");
    modal.style.cssText = "background:white;border-radius:12px;padding:24px;max-width:500px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:sans-serif;";

    modal.innerHTML =
      '<h2 style="margin:0 0 8px;font-size:18px;color:#333;">Share "' + (projectName || "Project") + '"</h2>' +
      '<p style="margin:0 0 16px;font-size:13px;color:#666;">Link expires in 12 months. Anyone with this link can view and copy the project.</p>' +
      '<div style="display:flex;gap:8px;">' +
      '<input id="cm-share-url" readonly value="' + escapeHtml(url) + '" style="flex:1;padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-size:13px;" />' +
      '<button id="cm-share-copy" style="padding:8px 16px;background:#00A651;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">Copy</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button id="cm-share-close" style="flex:1;padding:8px;background:#f0f0f0;border:1px solid #ccc;border-radius:6px;cursor:pointer;">Close</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var urlInput = document.getElementById("cm-share-url");
    urlInput.focus();
    urlInput.select();

    document.getElementById("cm-share-copy").addEventListener("click", function () {
      navigator.clipboard.writeText(url).then(function () {
        document.getElementById("cm-share-copy").textContent = "Copied!";
        setTimeout(function () {
          document.getElementById("cm-share-copy").textContent = "Copy";
        }, 2000);
      });
    });

    document.getElementById("cm-share-close").addEventListener("click", function () {
      document.body.removeChild(overlay);
    });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  function showShareFallback() {
    showShareResult(
      window.location.href,
      "project"
    );
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Import shared project from URL hash
  async function tryImportFromHash() {
    var hash = window.location.hash;
    if (!hash || hash.indexOf(SHARE_PREFIX) !== 0) return false;

    try {
      var projectData = await decodeShareUrl(hash);
      if (!projectData || !projectData.files) return false;

      // Wait for the editor to be ready
      function waitForEditor(retries) {
        retries = retries || 0;
        if (retries > 60) return;

        var importBtn = document.querySelector(".newproject");
        if (importBtn) {
          // Editor is loaded — trigger import via the files
          importSharedProject(projectData);
          return;
        }
        setTimeout(function () { waitForEditor(retries + 1); }, 500);
      }

      waitForEditor();
      return true;
    } catch (err) {
      if (err.message && err.message.indexOf("expired") !== -1) {
        document.addEventListener("DOMContentLoaded", function () {
          setTimeout(function () {
            alert("This share link has expired (12-month limit).");
          }, 2000);
        });
      }
      return false;
    }
  }

  function importSharedProject(projectData) {
    // Use the pxt import API to load the project
    function doImport(retries) {
      retries = retries || 0;
      if (retries > 60) return;

      try {
        if (window.pxt && window.pxt.targetConfig) {
          // Build a hex-like representation from the project files
          var files = projectData.files;
          var header = projectData.header;

          // Use the editor's import mechanism
          var mainContent = files["main.ts"] || files["main.blocks"] || "";

          // Create a temporary .mkcd file
          var projectJson = JSON.stringify({
            name: header.name || "Shared Project",
            files: files,
            editor: header.editor || "blocks"
          });

          // Try to use the built-in import
          if (window.pxt.editor && window.pxt.editor.importFile) {
            window.pxt.editor.importFile(projectJson, "json");
            return;
          }

          // Fallback: use the file upload mechanism
          var blob = new Blob([projectJson], { type: "application/json" });
          var file = new File([blob], (header.name || "shared") + ".mkcd", { type: "application/json" });

          // Find the import input and trigger it
          var importInput = document.querySelector('input[type="file"][accept=".mkcd,.hex"]');
          if (importInput) {
            var dt = new DataTransfer();
            dt.items.add(file);
            importInput.files = dt.files;
            importInput.dispatchEvent(new Event("change", { bubbles: true }));
            return;
          }
        }
      } catch (e) {
        console.error("Import error:", e);
      }

      setTimeout(function () { doImport(retries + 1); }, 1000);
    }

    doImport();
  }

  // Initialize
  if (window.location.hash && window.location.hash.indexOf(SHARE_PREFIX) === 0) {
    tryImportFromHash();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      installShareInterceptor();
    });
  } else {
    installShareInterceptor();
  }
})();
