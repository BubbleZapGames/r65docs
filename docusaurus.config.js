// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'R65',
  tagline: 'A Rust-inspired language for the 65816 processor',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://r65.dev',
  baseUrl: '/',

  organizationName: 'BubbleZapGames',
  projectName: 'r65docs',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/BubbleZapGames/r65docs/tree/main/',
        },
        blog: {
          showReadingTime: true,
          blogTitle: 'R65 Blog',
          blogDescription: 'News, deep dives and SNES development notes from the R65 project.',
          blogSidebarTitle: 'Recent posts',
          blogSidebarCount: 'ALL',
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'dark',
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'R65',
        logo: {
          alt: 'R65 Logo',
          src: 'img/logo-navbar.png',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docsSidebar',
            position: 'left',
            label: 'Docs',
          },
          {
            to: '/playground',
            label: 'Playground',
            position: 'left',
          },
          {
            to: '/examples',
            label: 'Examples',
            position: 'left',
          },
          {
            to: '/blog',
            label: 'Blog',
            position: 'left',
          },
          {
            href: 'https://github.com/BubbleZapGames/r65docs',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              {
                label: 'Language Overview',
                to: '/docs/getting-started/overview',
              },
              {
                label: 'Type System',
                to: '/docs/language/types',
              },
              {
                label: 'Calling Convention',
                to: '/docs/language/functions',
              },
            ],
          },
          {
            title: 'Resources',
            items: [
              {
                label: '65816 Programming Manual',
                href: 'http://archive.6502.org/datasheets/wdc_65816_programming_manual.pdf',
              },
              {
                label: 'WLA-DX Documentation',
                href: 'https://wla-dx.readthedocs.io/',
              },
              {
                label: 'Super Famicom Wiki',
                href: 'https://wiki.superfamicom.org/',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Blog',
                to: '/blog',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/BubbleZapGames/r65docs',
              },
            ],
          },
        ],
        copyright: `Copyright \u00a9 ${new Date().getFullYear()} Bubble Zap Games.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['rust', 'nasm'],
      },
    }),
};

export default config;
