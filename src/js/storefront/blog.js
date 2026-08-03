/* =============================================================================
   Velorex Music — storefront blog
   Used by: index.html (loaded after pages.js, before router.js)

   Two views:
     /blog          → initPageBlog()     listing of published posts
     /blog/<slug>   → initPageBlogPost() a single post

   Both are also server-rendered by seo-render.php so a crawler sees real
   content; this module is what takes over once the SPA boots, and what runs on
   client-side navigation.

   On innerHTML and post bodies: the HTML written into #blog-post-body is NOT
   escaped, because it is authored HTML and escaping it would print tags as
   text. That is safe only because api/_blog_helpers.php sanitises the body
   against a tag allowlist before it is ever stored. Everything else here —
   titles, excerpts, image URLs — goes through Utils.escape().
   ============================================================================= */

    var BLOG_CACHE = { list: null, posts: {} };

    function blogFormatDate(s) {
      if (!s) return '';
      // MySQL DATETIME ("2026-08-03 12:00:00") is not valid ISO 8601; Safari
      // returns Invalid Date without the T.
      var d = new Date(String(s).replace(' ', 'T'));
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function blogCardHtml(p) {
      var img = p.coverImage
        ? '<img src="' + Utils.escape(p.coverImage) + '" alt="' + Utils.escape(p.title) + '" loading="lazy" decoding="async">'
        : '<div class="blog-card-noimg"><i class="fas fa-music"></i></div>';
      var date = blogFormatDate(p.publishedAt);
      return '<article class="blog-card">'
        + '<a class="blog-card-media" href="/blog/' + Utils.escape(p.slug) + '"'
        + ' onclick="navigate(\'blog-post\',{slug:\'' + Utils.escape(p.slug) + '\'});return false;">' + img + '</a>'
        + '<div class="blog-card-body">'
        + (date ? '<div class="blog-card-date">' + Utils.escape(date) + '</div>' : '')
        + '<h2 class="blog-card-title"><a href="/blog/' + Utils.escape(p.slug) + '"'
        + ' onclick="navigate(\'blog-post\',{slug:\'' + Utils.escape(p.slug) + '\'});return false;">'
        + Utils.escape(p.title) + '</a></h2>'
        + (p.excerpt ? '<p class="blog-card-excerpt">' + Utils.escape(p.excerpt) + '</p>' : '')
        + '<a class="blog-card-more" href="/blog/' + Utils.escape(p.slug) + '"'
        + ' onclick="navigate(\'blog-post\',{slug:\'' + Utils.escape(p.slug) + '\'});return false;">Read more →</a>'
        + '</div></article>';
    }

    async function initPageBlog() {
      var grid = document.getElementById('blog-grid');
      if (!grid) return;

      if (BLOG_CACHE.list) {
        grid.innerHTML = BLOG_CACHE.list.length
          ? BLOG_CACHE.list.map(blogCardHtml).join('')
          : blogEmptyHtml();
        return;
      }
      grid.innerHTML = '<div class="loading-spinner"></div>';

      try {
        var res = await fetch(API_BASE + '/blog.php', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var posts = await res.json();
        BLOG_CACHE.list = Array.isArray(posts) ? posts : [];
        grid.innerHTML = BLOG_CACHE.list.length
          ? BLOG_CACHE.list.map(blogCardHtml).join('')
          : blogEmptyHtml();
      } catch (e) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem 1rem;">'
          + 'Could not load posts right now. Please try again shortly.</p>';
      }
    }

    function blogEmptyHtml() {
      return '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem 1rem;">'
        + '<div style="font-size:2rem;margin-bottom:0.75rem;">✍️</div>'
        + '<p>No posts published yet. Check back soon.</p></div>';
    }

    async function initPageBlogPost(params) {
      var host = document.getElementById('blog-post-container');
      if (!host) return;
      var slug = params && params.slug ? String(params.slug) : '';
      if (!slug) {
        host.innerHTML = blogPostMissingHtml('No post selected');
        return;
      }

      if (BLOG_CACHE.posts[slug]) { renderBlogPost(BLOG_CACHE.posts[slug]); return; }
      host.innerHTML = '<div class="loading-spinner"></div>';

      try {
        var res = await fetch(API_BASE + '/blog.php?slug=' + encodeURIComponent(slug), { cache: 'no-store' });
        if (res.status === 404) { host.innerHTML = blogPostMissingHtml('Post not found'); return; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var post = await res.json();
        BLOG_CACHE.posts[slug] = post;
        renderBlogPost(post);
      } catch (e) {
        host.innerHTML = blogPostMissingHtml('Could not load this post');
      }
    }

    function blogPostMissingHtml(msg) {
      return '<div style="text-align:center;padding:4rem 1rem;color:var(--text-muted);">'
        + '<h2 style="margin-bottom:0.75rem;">' + Utils.escape(msg) + '</h2>'
        + '<a href="/blog" onclick="navigate(\'blog\');return false;" class="btn btn-primary">Back to the blog</a>'
        + '</div>';
    }

    function renderBlogPost(post) {
      var host = document.getElementById('blog-post-container');
      if (!host) return;

      var titleEl = document.getElementById('blog-post-title');
      if (titleEl) titleEl.textContent = post.title;

      var date = blogFormatDate(post.publishedAt);
      var meta = [];
      if (date) meta.push(Utils.escape(date));
      if (post.author) meta.push(Utils.escape(post.author));
      if (post.readMinutes) meta.push(post.readMinutes + ' min read');

      var cover = post.coverImage
        ? '<div class="blog-post-cover"><img src="' + Utils.escape(post.coverImage) + '" alt="'
          + Utils.escape(post.title) + '" fetchpriority="high" decoding="async"></div>'
        : '';

      // post.content is intentionally NOT escaped — see the file header.
      host.innerHTML = '<article class="blog-post">'
        + cover
        + (meta.length ? '<div class="blog-post-meta">' + meta.join(' · ') + '</div>' : '')
        + '<div class="blog-post-body">' + (post.content || '') + '</div>'
        + '<div class="blog-post-footer">'
        + '<a href="/blog" onclick="navigate(\'blog\');return false;" class="btn btn-secondary">← All posts</a>'
        + '<a href="/products" onclick="navigate(\'products\');return false;" class="btn btn-primary">Browse the shop</a>'
        + '</div></article>';

      try { Seo.syncBlogPost(post); } catch (e) { console.warn('SEO blog sync failed:', e); }
      try { updateBreadcrumbs('blog-post', { slug: post.slug }); } catch (e) {}
    }
