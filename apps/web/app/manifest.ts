import type { MetadataRoute } from 'next';

// Makes Talentral installable on a phone's home screen. It opens on the learner's home.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/learn',
    name: 'Talentral',
    short_name: 'Talentral',
    description: 'Learn with your hub, even offline: lessons, quizzes, classes and your Passport.',
    start_url: '/learn?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6F7FB',
    theme_color: '#0D1230',
    lang: 'en',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My learning', short_name: 'Learn', url: '/learn', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Passport', url: '/passport', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
