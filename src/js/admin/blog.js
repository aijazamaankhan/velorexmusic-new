/* =============================================================================
   Velorex Music — admin blog panel
   Used by: vlx-admin-2026.html

   Posts list + a rich-paste editor. The editor is a contenteditable div driven
   by document.execCommand rather than a third-party WYSIWYG, because this
   project ships no build step and no runtime dependencies (CLAUDE.md §13).
   execCommand is formally deprecated but is implemented by every current
   browser and has no replacement for this job; if it is ever removed, the
   fallback is that the toolbar buttons stop working while typing and pasting
   still do.

   SECURITY: the paste handler below scrubs incoming HTML for tidiness — it is
   NOT the security boundary. api/_blog_helpers.php sanitises server-side on
   write, and that is what actually protects the storefront. Never rely on
   this file to keep a script tag out of the database.
   ============================================================================= */

    // Cached list so re-renders (filter changes, post-save refresh) don't refetch.
    var BLOG_POSTS = [];
    var blogEditingId = null;

    function blogAuthHeaders(extra) {
      return Object.assign({ 'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '' }, extra || {});
    }

    // ---------------------------------------------------------------- list ---

    async function loadBlogPosts() {
      const tbody = document.getElementById('blog-tbody');
      if (tbody) tbody.innerHTML = Skeleton.tableRows(4, 5);
      try {
        const res = await fetch(API_BASE + '/blog.php?all=1', {
          headers: blogAuthHeaders(), cache: 'no-store'
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        BLOG_POSTS = await res.json();
        renderBlogTable();
      } catch (e) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:var(--danger);">'
            + 'Could not load posts: ' + escapeHTML(e.message) + '</td></tr>';
        }
      }
    }

    function renderBlogTable() {
      const tbody = document.getElementById('blog-tbody');
      if (!tbody) return;
      if (!BLOG_POSTS.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:2.5rem;text-align:center;color:var(--text-muted);">'
          + 'No posts yet. Click <strong>New Post</strong> to write your first one.</td></tr>';
        return;
      }
      tbody.innerHTML = BLOG_POSTS.map(function (p) {
        const live = p.status === 'published';
        const when = p.publishedAt || p.updatedAt;
        const date = when ? new Date(when.replace(' ', 'T')).toLocaleDateString('en-IN',
          { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        const cover = p.coverImage
          ? '<img src="' + escapeHTML(p.coverImage) + '" alt="" style="width:54px;height:38px;object-fit:cover;border-radius:5px;">'
          : '<div style="width:54px;height:38px;border-radius:5px;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.9rem;">—</div>';
        return '<tr>'
          + '<td>' + cover + '</td>'
          + '<td><div style="font-weight:600;">' + escapeHTML(p.title) + '</div>'
          + '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">/blog/' + escapeHTML(p.slug) + '</div></td>'
          + '<td><span class="badge" style="background:' + (live ? 'rgba(34,197,94,0.15);color:#22c55e' : 'rgba(148,163,184,0.15);color:#94a3b8') + ';">'
          + (live ? 'Published' : 'Draft') + '</span></td>'
          + '<td style="color:var(--text-muted);font-size:0.85rem;">' + date + '</td>'
          + '<td style="white-space:nowrap;">'
          + (live ? '<a class="btn btn-sm" href="/blog/' + encodeURIComponent(p.slug) + '" target="_blank" rel="noopener" style="background:var(--surface);border:1px solid var(--border);">View</a> ' : '')
          + '<button class="btn btn-sm" onclick="openBlogEditor(' + p.id + ')">Edit</button> '
          + '<button class="btn btn-sm btn-danger" onclick="confirmDeleteBlogPost(' + p.id + ')">Delete</button>'
          + '</td></tr>';
      }).join('');
    }

    // -------------------------------------------------------------- editor ---

    function blogEditorEl() { return document.getElementById('blog-content'); }

    async function openBlogEditor(id) {
      blogEditingId = id || null;
      const modal = document.getElementById('blog-modal');
      if (!modal) return;

      document.getElementById('blog-modal-title').textContent = id ? 'Edit Post' : 'New Post';
      document.getElementById('blog-title').value = '';
      document.getElementById('blog-slug').value = '';
      document.getElementById('blog-excerpt').value = '';
      document.getElementById('blog-status').value = 'published';
      setBlogCover('');
      blogEditorEl().innerHTML = '';
      modal.style.display = 'flex';

      if (!id) { document.getElementById('blog-title').focus(); return; }

      // Fetch the full record — the list payload omits the body to stay small.
      try {
        const res = await fetch(API_BASE + '/blog.php?id=' + encodeURIComponent(id), {
          headers: blogAuthHeaders(), cache: 'no-store'
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const p = await res.json();
        document.getElementById('blog-title').value = p.title || '';
        document.getElementById('blog-slug').value = p.slug || '';
        document.getElementById('blog-excerpt').value = p.excerpt || '';
        document.getElementById('blog-status').value = p.status || 'draft';
        setBlogCover(p.coverImage || '');
        blogEditorEl().innerHTML = p.content || '';
      } catch (e) {
        showToast('Could not load post: ' + e.message, 'error');
      }
    }

    function closeBlogEditor() {
      const m = document.getElementById('blog-modal');
      if (m) m.style.display = 'none';
      blogEditingId = null;
    }

    function setBlogCover(url) {
      const prev = document.getElementById('blog-cover-preview');
      const input = document.getElementById('blog-cover-url');
      if (input) input.value = url || '';
      if (!prev) return;
      prev.innerHTML = url
        ? '<img src="' + escapeHTML(url) + '" alt="Cover preview" style="max-width:100%;max-height:150px;border-radius:8px;display:block;">'
          + '<button type="button" class="btn btn-sm btn-danger" style="margin-top:0.5rem;" onclick="setBlogCover(\'\')">Remove cover</button>'
        : '<span style="color:var(--text-muted);font-size:0.8rem;">No cover image</span>';
    }

    // Toolbar. execCommand operates on the current selection inside the
    // contenteditable, so focus must be restored first — clicking a button
    // blurs the editor and would otherwise apply the command to nothing.
    function blogExec(cmd, value) {
      blogEditorEl().focus();
      try { document.execCommand(cmd, false, value || null); }
      catch (e) { console.warn('execCommand failed:', cmd, e); }
    }

    function blogFormatBlock(tag) {
      blogEditorEl().focus();
      // Browsers disagree on whether the argument wants angle brackets.
      try { document.execCommand('formatBlock', false, '<' + tag + '>'); }
      catch (e) { try { document.execCommand('formatBlock', false, tag); } catch (e2) {} }
    }

    function blogInsertLink() {
      const url = prompt('Link URL (https://… or /product/…)');
      if (!url) return;
      blogExec('createLink', url.trim());
    }

    // Paste cleanup. Word and Google Docs paste enormous style/class soup; if we
    // let it through, the editor shows fonts and colours that will be stripped
    // server-side anyway, so what the admin sees would not be what publishes.
    // Cleaning here keeps the editor honest. The server still sanitises.
    function blogHandlePaste(e) {
      const cb = e.clipboardData || window.clipboardData;
      if (!cb) return;
      const html = cb.getData('text/html');
      const text = cb.getData('text/plain');
      e.preventDefault();

      if (html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        tmp.querySelectorAll('script,style,meta,link,iframe,object,embed,form,input,button').forEach(n => n.remove());
        tmp.querySelectorAll('*').forEach(function (el) {
          // Drop every attribute except the handful we keep.
          Array.from(el.attributes).forEach(function (a) {
            const keep = (el.tagName === 'A' && a.name === 'href')
              || (el.tagName === 'IMG' && (a.name === 'src' || a.name === 'alt'));
            if (!keep) el.removeAttribute(a.name);
          });
        });
        document.execCommand('insertHTML', false, tmp.innerHTML);
      } else if (text) {
        // Blank lines become paragraphs so plain-text paste still reads as prose.
        const html2 = text.split(/\n{2,}/).map(function (para) {
          return '<p>' + escapeHTML(para).replace(/\n/g, '<br>') + '</p>';
        }).join('');
        document.execCommand('insertHTML', false, html2);
      }
    }

    // ------------------------------------------------------------- uploads ---

    async function uploadBlogImage(file) {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(API_BASE + '/upload-blog-image.php', {
        method: 'POST', headers: blogAuthHeaders(), body: fd
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
      return data.url;
    }

    async function handleBlogCoverUpload(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        showToast('Uploading cover…');
        setBlogCover(await uploadBlogImage(file));
        showToast('<i class="fas fa-circle-check"></i> Cover uploaded');
      } catch (e) {
        showToast('Cover upload failed: ' + e.message, 'error');
      } finally { input.value = ''; }
    }

    async function handleBlogInlineUpload(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        showToast('Uploading image…');
        const url = await uploadBlogImage(file);
        blogEditorEl().focus();
        document.execCommand('insertHTML', false,
          '<img src="' + escapeHTML(url) + '" alt="" loading="lazy" decoding="async"><p><br></p>');
        showToast('<i class="fas fa-circle-check"></i> Image inserted');
      } catch (e) {
        showToast('Image upload failed: ' + e.message, 'error');
      } finally { input.value = ''; }
    }

    // ---------------------------------------------------------------- save ---

    async function saveBlogPost(publishOverride) {
      const title = document.getElementById('blog-title').value.trim();
      const content = blogEditorEl().innerHTML.trim();
      if (!title) { showToast('Title is required', 'error'); return; }
      if (!content || !blogEditorEl().textContent.trim()) {
        showToast('Post content is empty', 'error'); return;
      }

      const body = {
        title: title,
        slug: document.getElementById('blog-slug').value.trim(),
        excerpt: document.getElementById('blog-excerpt').value.trim(),
        content: content,
        coverImage: document.getElementById('blog-cover-url').value.trim(),
        status: publishOverride || document.getElementById('blog-status').value
      };
      if (blogEditingId) body.id = blogEditingId;

      try {
        const res = await fetch(API_BASE + '/blog.php', {
          method: 'POST',
          headers: blogAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body)
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
        showToast('<i class="fas fa-circle-check"></i> Post saved');
        closeBlogEditor();
        loadBlogPosts();
      } catch (e) {
        showToast('Save failed: ' + e.message, 'error');
      }
    }

    async function confirmDeleteBlogPost(id) {
      const post = BLOG_POSTS.find(function (p) { return p.id === id; });
      const ok = await adminConfirm({
        title: 'Delete this post?',
        message: 'This permanently removes “' + (post ? post.title : 'the post')
          + '”. If it was published, its URL will start returning 404.',
        confirmLabel: 'Delete post'
      });
      if (!ok) return;
      try {
        const res = await fetch(API_BASE + '/blog.php?id=' + encodeURIComponent(id), {
          method: 'DELETE', headers: blogAuthHeaders()
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
        showToast('Post deleted', 'success');
        loadBlogPosts();
      } catch (e) {
        showToast('Delete failed: ' + e.message, 'error');
      }
    }
