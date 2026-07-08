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

    // Scroll reveal
    var revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length && 'IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(function (el) { observer.observe(el); });
    } else {
        revealEls.forEach(function (el) { el.classList.add('visible'); });
    }

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
