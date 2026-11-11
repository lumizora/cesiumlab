export default function NotFoundView({path}: {path:string}) {
  return <section className="page not-found" data-testid="route-not-found">
    <p className="eyebrow">404 / LOST IN THE GLOBE</p>
    <h1>页面不存在</h1>
    <p>没有匹配 <code>#{path}</code> 的页面。请回到 Gallery 继续浏览。</p>
    <a className="button" href="#/">回到 Gallery</a>
  </section>;
}
