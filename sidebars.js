/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/overview',
        'getting-started/setup',
        'getting-started/faq',
      ],
    },
    {
      type: 'category',
      label: 'Language',
      items: [
        'language/types',
        'language/functions',
        'language/expressions',
        'language/statements',
        'language/control-flow',
        'language/match-expressions',
        'language/enums',
        'language/structs',
        'language/traits',
        'language/macros',
        'language/attributes',
        'language/lexical-structure',
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
        'platform/assembly-code',
        'platform/math',
        'platform/builtin_library',
        'platform/abi-models',
        'platform/compiler',
        'platform/tools',
        'platform/snes-rom-header',
      ],
    },
  ],
};

export default sidebars;
