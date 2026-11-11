export default function AppFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <div className="footer-logo">
            cesium<span>lab</span>
            <i>.</i>
          </div>
          <p>VISUAL FIRST · CREATIVE GEOSPATIAL EXPERIENCES</p>
        </div>
        <div className="footer-links">
          <a href="#/">GALLERY</a>
          <a href="https://github.com/lumizora/cesiumlab" target="_blank" rel="noopener noreferrer">
            GITHUB ↗
          </a>
          <a href="https://github.com/meta/astryx" target="_blank" rel="noopener noreferrer">
            ASTRYX ↗
          </a>
        </div>
        <div className="footer-copy">
          <span>© 2026 CESIUMLAB · A VISUAL-FIRST LAB</span>
          <span>
            v{__APP_VERSION__} · rev {__GIT_REVISION__} · CESIUM ION OPTIONAL
          </span>
        </div>
      </div>
    </footer>
  );
}
