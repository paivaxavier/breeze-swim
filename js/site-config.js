// Breeze Swim — site-wide config (edit here, no need to touch HTML)
window.BREEZE_SWIM = {
    waitlistUrl: 'https://docs.google.com/forms/d/1c64Ns39RSnr7syHeC3i726R5_S7e_lYatlo52aGr000/viewform',

    social: {
        instagram: 'https://www.instagram.com/breezeswimlessons/',
        facebook: 'https://www.facebook.com/breezeswimlessons'
    },

    pricing: {
        weekly: 90,
        perLesson: 22.5,
        registrationAnnual: 50,
        // Set when confirmed; leave null to show "contact for details"
        privatePoolFee: null
    },

    // Parent quotes — from public Facebook posts/recommendations
    reviews: [
        {
            quote: 'Breeze Swim is the best!! Brielle is so patient and kind to your little. My son swims like a fish at 2yo!',
            author: 'Brianna M.',
            source: 'Facebook · Palm Coast Moms',
            sourceUrl: 'https://www.facebook.com/groups/335021256611489/posts/26189266320760295/'
        },
        {
            quote: 'My son started at 14 months and my daughter is starting at 18 months! Brielle is amazing with the young ones — she\u2019s so patient with my toddlers!',
            author: 'Cathy J.',
            source: 'Facebook · Palm Coast Moms',
            sourceUrl: 'https://www.facebook.com/groups/335021256611489/posts/26189266320760295/'
        }
    ],

    facebookReviewsUrl: 'https://www.facebook.com/breezeswimlessons/reviews',

    // Homepage lesson videos — use .mp4 for best browser support (see README)
    videos: [
        {
            caption: 'Survival & water safety',
            poster: 'images/gallery-1.jpg',
            src: 'videos/clip-1.mp4'
        },
        {
            caption: 'Building confidence',
            poster: 'images/gallery-2.jpg',
            src: 'videos/clip-2.mp4'
        },
        {
            caption: 'Skills in progress',
            poster: 'images/gallery-3.jpg',
            src: 'videos/clip-3.mp4'
        }
    ]
};
