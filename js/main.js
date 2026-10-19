// Breeze Swim — shared site scripts
(function () {
    var toggle = document.getElementById('mobile-menu-toggle');
    var menu = document.getElementById('mobile-menu');
    if (toggle && menu) {
        toggle.addEventListener('click', function () {
            menu.classList.toggle('open');
            var open = menu.classList.contains('open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // FAQ chevron sync on toggle
    document.querySelectorAll('.faq-item').forEach(function (item) {
        item.addEventListener('toggle', function () {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    });

    // Scroll reveal. Photos sit inside .reveal at opacity 0 until .visible is added.
    var revealEls = document.querySelectorAll('.reveal');
    function showReveal(el) {
        el.classList.add('visible');
    }
    function inView(el) {
        var rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight * 0.92;
    }
    function revealInView() {
        revealEls.forEach(function (el) {
            if (!el.classList.contains('visible') && inView(el)) showReveal(el);
        });
    }
    if (revealEls.length && 'IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    showReveal(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(function (el) { observer.observe(el); });
    } else if (revealEls.length) {
        revealEls.forEach(showReveal);
    }
    // IntersectionObserver can miss elements when html/body use overflow-x: clip.
    revealInView();
    window.addEventListener('scroll', revealInView, { passive: true });
    window.addEventListener('resize', revealInView);

    // Sticky mobile CTA bar
    var mobileCta = document.getElementById('mobile-cta-bar');
    if (mobileCta) {
        var hero = document.querySelector('.hero-section');
        var showBar = function () {
            if (!hero) {
                mobileCta.classList.add('show');
                return;
            }
            var pastHero = window.scrollY > hero.offsetHeight * 0.5;
            mobileCta.classList.toggle('show', pastHero);
        };
        showBar();
        window.addEventListener('scroll', showBar, { passive: true });
    }
    // Lesson videos — local files from js/site-config.js
    function renderLessonVideos() {
        var section = document.getElementById('lesson-videos-section');
        var grid = document.getElementById('lesson-videos-grid');
        if (!section || !grid) return;

        var items = (window.BREEZE_SWIM && window.BREEZE_SWIM.videos) || [];
        grid.innerHTML = '';

        items.forEach(function (item, index) {
            var src = (item.src || '').trim();
            if (!src) return;

            var card = document.createElement('div');
            card.className = 'video-card card-soft border-0 shadow-lg';

            var video = document.createElement('video');
            video.controls = true;
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.preload = 'metadata';
            video.setAttribute('aria-label', item.caption || ('Swim lesson clip ' + (index + 1)));
            if (item.poster) video.poster = item.poster;
            video.src = src;
            card.appendChild(video);

            if (item.caption) {
                var caption = document.createElement('div');
                caption.className = 'video-card-caption';
                caption.innerHTML = '<p>' + item.caption + '</p>';
                card.appendChild(caption);
            }

            grid.appendChild(card);
        });

        if (!grid.children.length) {
            section.style.display = 'none';
        }
    }

    renderLessonVideos();

    // Facebook reviews from js/site-config.js
    function renderReviews() {
        var grid = document.getElementById('facebook-reviews-grid');
        if (!grid) return;

        var config = window.BREEZE_SWIM || {};
        var reviews = config.reviews || [];
        var fbReviewsUrl = config.facebookReviewsUrl || (config.social && config.social.facebook);
        grid.innerHTML = '';

        reviews.forEach(function (item) {
            if (!item.quote) return;

            var card = document.createElement('div');
            card.className = 'testimonial-card card-soft rounded-2xl';

            var stars = document.createElement('div');
            stars.className = 'flex gap-1 mb-3 text-breeze-sky';
            stars.setAttribute('aria-hidden', 'true');
            for (var i = 0; i < 5; i++) {
                stars.innerHTML += '<svg class="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
            }
            card.appendChild(stars);

            var quote = document.createElement('blockquote');
            quote.textContent = '\u201C' + item.quote + '\u201D';
            card.appendChild(quote);

            var author = document.createElement('p');
            author.className = 'author';
            author.textContent = item.author || 'Breeze Swim parent';
            card.appendChild(author);

            if (item.source) {
                var source = document.createElement('p');
                source.className = 'review-source';
                if (item.sourceUrl) {
                    var link = document.createElement('a');
                    link.href = item.sourceUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = item.source;
                    source.appendChild(link);
                } else {
                    source.textContent = item.source;
                }
                card.appendChild(source);
            }

            grid.appendChild(card);
        });

        if (fbReviewsUrl) {
            var fbCard = document.createElement('a');
            fbCard.href = fbReviewsUrl;
            fbCard.target = '_blank';
            fbCard.rel = 'noopener noreferrer';
            fbCard.className = 'testimonial-card card-soft rounded-2xl bg-gradient-to-br from-breeze-foam to-white hover:shadow-lg transition-shadow group';
            fbCard.innerHTML =
                '<div class="w-12 h-12 rounded-xl bg-white shadow flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">' +
                '<svg class="w-6 h-6 text-breeze-sky" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/></svg>' +
                '</div>' +
                '<blockquote class="not-italic font-semibold text-slate-800">Read all Facebook reviews</blockquote>' +
                '<p class="text-sm text-slate-500 mt-2 flex-1">See what other Flagler County families have shared on our Facebook page.</p>' +
                '<p class="author text-breeze-sky">View on Facebook \u2192</p>';
            grid.appendChild(fbCard);
        }
    }

    renderReviews();

    // Waitlist links → Google form when configured, otherwise contact page
    var waitlistUrl = window.BREEZE_SWIM && window.BREEZE_SWIM.waitlistUrl;
    document.querySelectorAll('[data-waitlist]').forEach(function (el) {
        if (waitlistUrl) {
            el.href = waitlistUrl;
            el.target = '_blank';
            el.rel = 'noopener noreferrer';
        } else {
            el.href = 'contact.html#waitlist';
        }
    });
})();
