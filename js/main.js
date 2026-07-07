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
})();
