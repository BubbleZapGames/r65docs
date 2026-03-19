/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/language-overview',
        'getting-started/installation',
        'getting-started/faq',
      ],
    },
    {
      type: 'category',
      label: 'Language',
      items: [
        'language/lexical-structure',
        'language/types',
        'language/expressions',
        'language/statements',
        'language/control-flow',
        'language/match-expressions',
        'language/functions',
        'language/structs',
        'language/enums',
        'language/traits',
        'language/macros',
        'language/attributes',
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
        'platform/math',
        'platform/abi-models',
        'platform/compiler',
        'platform/builtin_library',
        'platform/tools',
      ],
    },
  ],
};

export default sidebars;
