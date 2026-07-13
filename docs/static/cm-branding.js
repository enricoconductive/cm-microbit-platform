(() => {
    const homeUrl = "https://conductivemusic.uk/";
    const style = document.createElement("style");
    style.textContent = `
        .header-logo img,
        .ui.item.logo.brand img {
            height: 3.1rem !important;
            width: auto !important;
            margin: 0 1rem !important;
        }
        .header-org-logo { display: none !important; }
        .menubar .ui.menu .brand:before {
            margin-left: 10px;
            margin-right: 10px;
        }
        .sim-label, .sim-wireframe .sim-label { display: none !important; }
    `;
    document.head.appendChild(style);

    const applyHomeDestination = () => {
        if (window.pxt?.appTarget?.appTheme) {
            window.pxt.appTarget.appTheme.homeUrl = homeUrl;
        }
        document.querySelectorAll("a[href]").forEach(link => {
            if (link.matches(".home, .logo, .brand, [aria-label='Home']")
                || link.closest(".home, .logo, .brand")) {
                link.href = homeUrl;
            }
        });
    };

    applyHomeDestination();
    new MutationObserver(applyHomeDestination).observe(document.body, { childList: true, subtree: true });
})();
