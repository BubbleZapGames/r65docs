/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      items: ['getting-started/language-overview'],
    },
    {
      type: 'category',
      label: 'Language',
      items: [
        'language/lexical-structure',
        'language/types',
        'language/expressions',
        'language/statements',
        'language/functions',
        'language/structs',
        'language/enums',
        'language/traits',
        'language/macros',
      ],
    },
    {
      type: 'category',
      label: 'Hardware',
      items: [
        'hardware/registers',
        'hardware/memory-model',
        'hardware/processor-modes',
        'hardware/interrupts',
      ],
    },
    {
      type: 'category',
      label: 'Platform',
      items: [
        'platform/snes-rom-header',
        'platform/register-allocation',
      ],
    },
  ],
};

export default sidebars;
