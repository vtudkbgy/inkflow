  // ==================== PAGE DÉTENTE : JEUX ET MONNAIE INTERNE (JETONS FICTIFS UNIQUEMENT) ====================
  // Aucun argent réel, aucun achat de jetons, aucun lien externe. Le solde vit dans localStorage.
  // Les jetons servent à créer (cahier, page, import PDF) et à débloquer des personnalisations.
  // Ouvrir, lire, modifier, exporter et supprimer restent toujours gratuits.
  const DETENTE_STORAGE_KEY = 'inkflow.detente.v1';
  const DETENTE_CODES_USED_KEY = 'inkflow.detente.codesUsed.v1';
  const DETENTE_START_BALANCE = 1000;
  const DETENTE_BETS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  const DETENTE_BJ_BETS = [2, 4, 10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000]; // pairs : 3 pour 2 toujours entier
  const DETENTE_ROULETTE_CHIPS = [1, 5, 25, 100, 500, 1000, 5000, 10000];
  const DETENTE_COSTS = { notebook: 10, page: 1, pdf: 10 };
  const DETENTE_HISTORY_MAX = 8;
  const DETENTE_CELL_H = 88;
  const DETENTE_TABS = ['slot', 'blackjack', 'roulette', 'shop', 'bank', 'odds'];
  // <detente-codes> généré par scripts/generate-detente-codes.js : empreintes SHA-256 salées uniquement, jamais de code en clair
  const DETENTE_CODE_BOOK = [
    ['g', 1, '5de32291dfd637cd0dda832ed92477c3', '6755fb2f2605ebb65ae8d9fcf23e32ad45c13866c312745d4228d23b53aa2057'],
    ['g', 1, '9b21f162d60d1dd1f771df3fa267b5c0', 'b789acc7517fe3b1d902c6f7e8f0a137db904657921e0e5193bd7b8bf0c0df38'],
    ['g', 1, 'd8aa8f735bb7676852decb025bf46333', 'e492586ec9d849f237ecf81c6087916fa2bdfd54d56ff3c89fd35a7582f29029'],
    ['g', 1, 'fab4fc85a086447dae7ce3fbf704540a', '770a4047db8a37fdbf65cb2a788f88e63b7fc7d84d7776fe34a4f6777bf0b4f5'],
    ['g', 1, 'd409af1a8d33f9249f19ec084f2636e7', '15944f22f2f1e82a29fb7065cdc5fad094cfa851e4bcb4671e5ef9ab1e1fc5a5'],
    ['g', 1, 'f8499ed7f112d12409f4273abd89f577', '1780a939dc9dd6877c2c7867669e065da8ae396246dbfa109fca1c4d2af30342'],
    ['g', 1, 'b68f2ba71fa84f324e8499d7b746ff98', '9bfc7026abae4dedd03c8d1924358214bb58f6da274d0c07ab7abee49c2a5a04'],
    ['g', 1, '738f81638b582fd78ef0b377bed7d337', 'b36fc079a85eafe7f276d485dfa1a1c994457b712530c1521b66744350c80457'],
    ['g', 1, '2b6bc33b35de9ce446cb7911071cb6a6', 'b054ada4de2ba8a99288be4639dabf900df794a30d3019767c454ec202477ac9'],
    ['g', 1, 'b21cfb3dd3629f68e5be8ba029c1f5fb', 'a5698db5b6ef27013e31f8acd080b157f68f0bbd98ba1720d9b4bf183fc5223a'],
    ['g', 50, '3a52060211753ecfb52aab3bdf6a4e13', '579c73f3805d81fb3722f93430c200b04b31366888f344f0cae85e65ac4734a0'],
    ['g', 50, 'f4dfcacdb9be648000f076f607b2c2ab', '49cd5273be1c1b04cf7fe7da14074c229157643cf7ab795367e84720699ac277'],
    ['g', 50, '6399745246c17852e8d11853304913b0', 'f050b6881551517f14e80ea140e26f90f2947a5145ca7d73c250904594c11efa'],
    ['g', 50, '131eeb2937958700c9b5bc47afd44c01', 'ca8407bf4bdaa8ecd7c4be408fec65a64eaef49ee34c42d17e188593d9d09170'],
    ['g', 50, 'f7e0447048fcd44d0f62cb8111c2c512', 'b7afc82cdcc867682fbdf58d71d9fb7f9fcff985c7b5930de9cdcdf2fbfb43a4'],
    ['g', 50, '1e4a871a92ae85887b7e2c97912a613c', '8618799ab8ef934d1c555955e0c339fc5ac6976ec58e4abae3ec1064324640f2'],
    ['g', 50, '42c572f28ad07a6fd7b919da2446ab9c', '02e1e522860781076167040e4e8433fd8660d51816b4a6cfae55d89bb8ad9a50'],
    ['g', 50, 'b0c81b37b59c85b6214eb6491d9c44c3', '0e28c3cae460a401c4a9ecfb87119ba5485a7234673d95437f88f48d8ad55872'],
    ['g', 50, '83575427422eb1baf89e32c854380925', 'ca85a79faf35b67ceb5f82b2f5acff7974f23688625e6e7c5cd372fe5be5136a'],
    ['g', 50, '9915fff979153d46d041fb32b5ec083e', '17153f92471b82c908508d7afa72368335515117069e34538fae3fc008a82ace'],
    ['g', 100, '98ea1ddc30d13dd61bd1197a0e70a007', '152c4733ad35c90d2fd239e81918b428afbb130f4ba935928745b0c3807928b7'],
    ['g', 100, 'e30a0fb70cebfe5a439d9d32ea9f92e7', '760e3643cf9c3712c39d02c288efc1a3487bc089fec3dd934b69754ec0453ad0'],
    ['g', 100, '64b00e995df75aab50bb1b02cfcb9b4c', '2c33f17e355d8e3a8ebffcddc950898ad04b195d53fd27e37f6afe3f832d26a5'],
    ['g', 100, '23225affc5d65bcaec49be7cc06ba0a9', '13acb902587bd929df974ba95e91fa3e6b49bd20f03b3b9ff956a0ecf539c203'],
    ['g', 100, '31c0bbc89c9170d19f4ed1a0261fa1f5', '0a256fbc0228ca9964877c9141350e142d26d46f7a102aee2a216ba94f9bf6b4'],
    ['g', 100, 'a6ae82c29088d2f1bb7e691c4bbfe46c', '0ee047517ec373069e5fe518d2c89409d4ad147e947c6f69811a2d58f8b0e39f'],
    ['g', 100, '3391399c134b61fc5abc7e1a5047d2b8', 'c2aab18e80684324d067eae622dc91d781bf51ca0297ad767b8534ab774aede0'],
    ['g', 100, '322cf5009292c3d903abaf5079f077bd', '3e78c1fc3e2322d4984033f955c4590f414ed6662c504fc8fe06ea89d41fc0a5'],
    ['g', 100, '2846633b5ea2aba6c63e02d1b0320d62', '58b198c2d7d595f1a1bf8977f1aa44d8b5ba41b18d3a282d6156f82e8461725d'],
    ['g', 100, '85cb156800edccb66aa650901ac69b1c', 'a2068076f14311a70588da38a64a81cf5a32b9f615541c9a5b52befaa7347465'],
    ['g', 1000, '4a105a7393281d6da984452ea5bf694a', 'a6861f37b79a91fd83240b551231c6417c78bc3fc5d0caf98c105c6a907fd102'],
    ['g', 1000, '38327c4e5140c5b07549fa2498534f48', '07f2351f149e2d20a24f138234b9c89261a97759ea42c59597ddf911c9769e6d'],
    ['g', 1000, 'b853873e21abba924970cdffd3a76e0f', 'c02d129ec7b7fe0472fec5b8b686d775478b407c756f918308fdfa78639dd37a'],
    ['g', 1000, '111a06d6167b61b751aac867b01b64a0', 'bff122b3675318d0156b6120d71fc36ed90adb5a73210ee0ceafedbd0e616005'],
    ['g', 1000, 'f1a36e15d494f47f112c21f11526f50d', '8ae344b26f977b79b9468ef1f35b5170af975a5ef667c11c914ec4f48aaac54d'],
    ['g', 1000, '9956674bb2bfb87ae3ea0b0e495d4d68', 'fa10d0c8a089ca14ec4c85647f7d972219e65d46fc1c37d33fab6edb4385fa76'],
    ['g', 1000, '22d14ecdd26f74cb0c066bf64c0e66e0', '46521003e1e2e66c84425de7dadf9fd4ab2f057fac2ad3ff3b6acc4848471cc4'],
    ['g', 1000, '527d7df3bed1988352390f9473f739cd', '0092b2c257c31a63c24826a284c05f7c6bfa46a7c9762faabaa5ff013b7a3f25'],
    ['g', 10000, '194fc3474636aea5a940e1ad0e70b396', '6ff99ad0d1b5d8e3e8399c20e7d5a97394d1d11cd3ac4a3c915ca09a89b2bcbb'],
    ['g', 10000, '54b57b49f65aa774c1dded5a9f256a03', 'f7960ef46d6a6cfc4011f7cc6fc1a71ea267f0d78445a59af79f9782edb9387d'],
    ['g', 10000, '639e78a069d2a9a7413474c9503320c2', 'c60734aed256943a2384d2ced0f78a7d36c823c6a581c15c4574487ce332d34b'],
    ['g', 10000, '8b73cd26b4dd9c593ce7e13b04c71648', 'b324d08e6b97c91d333f42b011c98b4021d8210e045f414b83fb38bdb7aaf527'],
    ['g', 10000, 'e8495ee9a3318a23e96c4f4284e9db11', '84a0b874c117f0a7a5696b30532afc453c335ae546cabf293ab6c7046a3ff6ea'],
    ['g', 10000, '0be95068996f63e3a0f68911013020de', '344997e921230c69a748b68940717f2fff224ee968ef22d22aefc9865d5e0140'],
    ['g', 100000, '5361e63778fd6f6abe874dc3fb9fb494', '5fc67f394bc8f044de77b918812533912b9e1778c51ae65e82be3ad53020c16e'],
    ['g', 100000, '9a8412e01d72a6794c52a3d02ab2a1f3', '1860fcaa9bbf50a7d22a91d5c180733a191c416916d4d5338dfcfa59f7362fb4'],
    ['g', 100000, 'd8f479b1e7cf224cbe18a6158748cfc8', '15fd206d4d7f7690ddd82b5a3b843ea315a77732b7e17b58e59666e1718ef49b'],
    ['g', 100000, 'b6e34b0d09bbee70cb3b6fc95949ffbc', '0337d7a16cdb2039811c254f309086072bf26f4ccb6e08a659c99f8aa0a32d34'],
    ['g', 1000000, '6348ecca7150cbad5628655ec3dec834', '58d64a6ddd7ae3778cf352c9c3dae1b82ec3c04d171bd2d75ea32e286eb9d756'],
    ['g', 1000000, 'af987c110d80c30b8bc7b5f3c2fb1b9d', '9375b780bef8725d4f8d6f94bef221965f17a4be580243b2364cca038547bf2b'],
    ['g', 1000000, 'ba5de075ec0e1c8e68057fe172a892fa', '6aef6c8fbae2ded33e245ff467ccb296bae4a3d7c5963840024555f04817daf2'],
    ['p', 100, '858a91e98aeb5e5940a6a95df05c3fe1', 'e1793163ba244b37975c83203b7d9ea62d07a678f0257bbb1e89a0368e3f1666'],
    ['p', 100, '6d13d9d9c533c73ba2c3e3a8f737f16d', '5f7062a66cd7d3284a06ae9b6459e9e97777367f16a87af79073c5cdf635b216'],
    ['p', 100, '98003b638414f181a711375a847387ed', 'f68cb36c0b8d9ee89021c2a4e9bd8e7a26464f4e23c72f13186b740fb0d8a2b0'],
    ['p', 100, '535d264dcd488d6443b59657cfb62449', '538914d86051b54f86f914a8ac2b9dd4c5f9d50235aa2f0159a5c37efa14b6bc'],
    ['p', 100, '3cbabf980414d400a59c4f10e12169c2', '3f04a3b54e1ada61e5da3ed50c57dd40a19305affd180f5e8e723872c6d3acbe'],
    ['p', 1000, '4f01f60ae6be2aba1599a2e00fb587ed', 'f32e88c5939a75dad2ff6b2dd12a8aada2e08c0eb063765c3490e5185fefaa3f'],
    ['p', 1000, '1922cc576fa6d68ed5c208b3f646f538', '6d710bd0a07b53e5fe6d01abf2ddbefdfd408278635b40bc01fb46036cdd6a69'],
    ['p', 1000, '5f547f329edcda937de396c8b52c39ac', '1d132aa659ea8efd785eb8cdd2085ba5f0a5311b49ffd8a6a59b73d08baab8e0'],
    ['p', 1000, '52778656f1d8781e4c01336e82071e5a', 'bcd508151e1fe24a2bed94fefb6d4064cd4517e9ed96fd1631b776858f33968d'],
    ['p', 1000, '629632a729ff6c83037a4d832b2cf425', '9135dedd237d92e952a933431ffead3321180c10ded04e5027c172d73b16c149'],
    ['p', 1000, 'd4f5fcf5c53f460cb11ef10e5bf9e5b1', 'efd9c03d35d174432f89200f148e17b41a74f220623015ad0274f4fd9c5fe34f'],
    ['p', 10000, '9171402bafb4d4116b624eaf95180b63', 'b1a222d94ad9010fa91e6825b1ee0d85a021d353cbac3d0e5ba03bea27399751'],
    ['p', 10000, 'be77632d39e3973d88addc4c8bff772d', '850236a999a7d14786368416f1d8c1ea35fc6b0fea7ab7356262a26a50bc40c2'],
    ['p', 10000, '3c94d2af8de092534602904ce1f6487c', 'a6a876074975404db5cfbebd724357718a88566a522421baee2733b7acc2a1fb'],
    ['p', 10000, 'cb431bf5cb0cb7dfb68e3913006fc2fe', '895e6b497a7b813dc1b3979488274ad8276b66d88d5962270cff48bb770f662c'],
    ['p', 10000, '3515d0b93ed7bf0eace886c81f02190a', '1b6a74e735789feb2c6a40be3bbc2bdacf541d038b0a9d75e4403bf8635e8b51'],
    ['p', 100000, 'ba6168d79eb6ba608886e6828fe9c2d2', 'f368e3eaa201b25911dad3ec963c7e6c9e84a52303945d648f3843f4ec97fd40'],
    ['p', 100000, '3d9817e1f82bdbe4b021ed81ba6125e6', '8ea68ede1143d9f6f03ebd76ba5e608ed78bc4f329cdc41edee37a1e754a747d'],
    ['p', 100000, '3cba8674b605c7b8409b3c2171a5d2fa', '5701995fb524f033934aaf713d2819696258d01aba080fb6afa7fbb9bea22d4f'],
    ['p', 1000000, '52c19fda6493d68c22f58e14bcd3056f', '21d3076c15f64de8e8b6ffaba527033805afbd6eb19803b8e9f6e027f4ac0e19'],
    ['p', 1000000, '8d472a6aa5aabeaa3113776474271a7e', '2969f3dbb41b0fc6acf11f24a7a6239e53ee87cdba6c331f5f7911715c5e2585']
  ];
  // </detente-codes>

  // Symboles au trait (viewBox 48×48). Poids = fréquence sur la bande ; mult = gain pour trois identiques.
  // Taux de retour théorique 93,4 %, gain sur 36,7 % des lancers (paires adjacentes comprises).
  const DETENTE_SYMBOLS = [
    { id: 'goutte', label: 'Goutte d’encre', weight: 6, mult: 3,
      svg: '<path d="M24 6.5C21 11.5 12.5 21 12.5 29a11.5 11.5 0 0 0 23 0C35.5 21 27 11.5 24 6.5Z"/><path class="ink-soft" d="M18.2 29.6a6 6 0 0 0 5.2 5.6"/>' },
    { id: 'feuille', label: 'Feuille', weight: 5, mult: 5,
      svg: '<path d="M10.5 37.5C9.5 21 21 10 38.5 9.5 38.5 27 27.5 38.5 10.5 37.5Z"/><path class="ink-soft" d="M10.5 37.5 30.5 17.5M19 29h7.5M23.5 24.5V18"/>' },
    { id: 'lune', label: 'Lune', weight: 4, mult: 8,
      svg: '<path d="M30.5 7.5A17 17 0 1 0 40.5 35 13.5 13.5 0 1 1 30.5 7.5Z"/><path class="ink-soft" d="M36 13.5l1.2 2.6 2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6-2.6-1.2 2.6-1.2Z"/>' },
    { id: 'etoile', label: 'Étoile', weight: 3, mult: 12,
      svg: '<path d="M24 7.5l4.9 10.4 11.3 1.4-8.3 7.8 2.1 11.2L24 32.8l-10 5.5 2.1-11.2-8.3-7.8 11.3-1.4Z"/>' },
    { id: 'coeur', label: 'Cœur', weight: 2, mult: 25,
      svg: '<path d="M24 39C11 30.5 7.5 23 9.6 16.6 11.8 10.4 19.8 9.6 24 16 28.2 9.6 36.2 10.4 38.4 16.6 40.5 23 37 30.5 24 39Z"/><path class="ink-soft" d="M14.5 17.5a4.5 4.5 0 0 1 4-3"/>' },
    { id: 'plume', label: 'Plume', weight: 1, mult: 60,
      svg: '<path d="M39.5 7.5C27 8.5 17.5 17.5 14.5 31.5 23 31.5 33 25 39.5 7.5Z"/><path class="ink-soft" d="M34 13 10 40M28 20.5h-6.5M31.5 16l-4.5-.5M24.5 25.5l-6 .5"/>' }
  ];
  const DETENTE_TWO_PLUMES_MULT = 8;
  const DETENTE_PAIR_MULT = 2;

  // ---------- Boutique : personnalisations débloquables ----------
  const DETENTE_SHOP = [
    { id: 'theme-sauge', kind: 'theme', label: 'Sauge', price: 150, light: '#3d7a5a', lightDark: '#2f6248', dark: '#6cc497', darkDark: '#3d7a5a' },
    { id: 'theme-prune', kind: 'theme', label: 'Prune', price: 150, light: '#8a3d74', lightDark: '#6f2f5d', dark: '#d58cc0', darkDark: '#a8508f' },
    { id: 'theme-ambre', kind: 'theme', label: 'Ambre', price: 150, light: '#b35a0b', lightDark: '#924808', dark: '#f2a54d', darkDark: '#c97a1f' },
    { id: 'theme-encre', kind: 'theme', label: 'Encre de nuit', price: 250, light: '#283f91', lightDark: '#1e3175', dark: '#93abff', darkDark: '#5f7ce0' },
    { id: 'tone-mint', kind: 'tone', tone: 'mint', label: 'Vert d’eau', price: 100, swatch: '#eef6f0' },
    { id: 'tone-rose', kind: 'tone', tone: 'rose', label: 'Rose poudré', price: 100, swatch: '#fbf0f0' },
    { id: 'tone-sky', kind: 'tone', tone: 'sky', label: 'Bleu ciel', price: 100, swatch: '#eef4fb' },
    { id: 'tone-kraft', kind: 'tone', tone: 'kraft', label: 'Kraft', price: 150, swatch: '#ecdfc6' },
    { id: 'cover-sauge', kind: 'cover', label: 'Sauge', price: 200, coverColor: '#4d7c61', accent: '#c9e0cf', style: 'simple' },
    { id: 'cover-bordeaux', kind: 'cover', label: 'Bordeaux', price: 200, coverColor: '#7f1d1d', accent: '#f59e0b', style: 'pat-fluid' },
    { id: 'cover-ocre', kind: 'cover', label: 'Ocre', price: 200, coverColor: '#a16207', accent: '#fde68a', style: 'pat-zigzag' },
    { id: 'cover-nuit', kind: 'cover', label: 'Nuit dorée', price: 300, coverColor: '#1e1b4b', accent: '#d4a017', style: 'pat-waves' },
    { id: 'cover-ardoise', kind: 'cover', label: 'Ardoise et or', price: 300, coverColor: '#1f2937', accent: '#c8a24a', style: 'pat-brushes' },
    { id: 'theme-framboise', kind: 'theme', label: 'Framboise', price: 200, light: '#be123c', lightDark: '#9f1239', dark: '#fb7185', darkDark: '#e11d48' },
    { id: 'theme-graphite', kind: 'theme', label: 'Graphite', price: 200, light: '#475569', lightDark: '#334155', dark: '#a5b4c8', darkDark: '#64748b' },
    { id: 'tone-lavande', kind: 'tone', tone: 'lavande', label: 'Lavande', price: 120, swatch: '#f3effa' },
    { id: 'tone-sable', kind: 'tone', tone: 'sable', label: 'Sable', price: 120, swatch: '#f6efe0' },
    { id: 'tone-peche', kind: 'tone', tone: 'peche', label: 'Pêche', price: 120, swatch: '#fdf0e6' },
    { id: 'cover-foret', kind: 'cover', label: 'Forêt', price: 250, coverColor: '#14532d', accent: '#a3e635', style: 'pat-waves' },
    { id: 'cover-lagon', kind: 'cover', label: 'Lagon', price: 250, coverColor: '#155e75', accent: '#67e8f9', style: 'pat-fluid' },
    // Fournitures : achats répétables, mis en stock et consommés avant le solde lors d'une création
    { id: 'pack-pages', kind: 'pack', stock: 'page', qty: 12, label: 'Bloc de 12 pages', price: 10 },
    { id: 'pack-ramette', kind: 'pack', stock: 'page', qty: 50, label: 'Ramette de 50 pages', price: 35 },
    { id: 'pack-cahiers', kind: 'pack', stock: 'notebook', qty: 3, label: 'Lot de 3 cahiers', price: 25 },
    { id: 'pack-pdf', kind: 'pack', stock: 'pdf', qty: 3, label: 'Lot de 3 imports PDF', price: 25 }
  ];
  const DETENTE_SHOP_GROUPS = [
    { kind: 'pack', title: 'Fournitures', note: 'Achats en lot, moins chers qu’à l’unité. Le stock sert avant le solde quand tu crées une page, un cahier ou importes un PDF.' },
    { kind: 'theme', title: 'Thèmes de couleur', note: 'Couleur d’accent de toute l’application.' },
    { kind: 'tone', title: 'Fonds de page', note: 'Nouvelles teintes dans le menu Papier de la page.' },
    { kind: 'cover', title: 'Couvertures de cahier', note: 'Dans la création de cahier et la bibliothèque de couvertures.' }
  ];
  const DETENTE_STOCK_KINDS = ['notebook', 'page', 'pdf'];
  const DETENTE_STOCK_LABELS = { notebook: ['cahier', 'cahiers'], page: ['page', 'pages'], pdf: ['import PDF', 'imports PDF'] };
  const DETENTE_STOCK_MAX = 100000;
  const DETENTE_LEDGER_MAX = 60;

  const detenteState = {
    balance: DETENTE_START_BALANCE,
    debt: 0,
    borrowed: 0,
    unlocked: [],
    stock: { notebook: 0, page: 0, pdf: 0 },
    ledger: [], // relevé : { t, label, delta, balance, count }
    theme: 'default',
    tab: 'slot',
    betIndex: 3,
    bjBetIndex: 2,
    chipIndex: 1,
    volume: 25,
    muted: false,
    history: [],
    rouletteHistory: [],
    loaded: false,
    spinning: false,
    strip: [],
    positions: [0, 0, 0],
    cellH: DETENTE_CELL_H,
    audioCtx: null,
    leverDrag: null,
    eventsBound: false,
    codeBusy: false,
    funds: null // { cost, label, action } : création en attente faute de jetons
  };

  function loadDetenteState() {
    if (detenteState.loaded) return;
    detenteState.loaded = true;
    // Le compte (code client) est créé avant toute écriture du portefeuille : c'est ce qui
    // distingue un appareil déjà en service d'une installation neuve (voir getDetenteAccount)
    getDetenteAccount();
    try {
      const raw = localStorage.getItem(DETENTE_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      if (Number.isFinite(data.balance) && data.balance >= 0) detenteState.balance = Math.floor(data.balance);
      if (Number.isFinite(data.debt) && data.debt >= 0) detenteState.debt = Math.floor(data.debt);
      if (Number.isFinite(data.borrowed) && data.borrowed >= 0) detenteState.borrowed = Math.floor(data.borrowed);
      if (Array.isArray(data.unlocked)) detenteState.unlocked = data.unlocked.filter((id) => DETENTE_SHOP.some((it) => it.id === id && it.kind !== 'pack'));
      if (data.stock && typeof data.stock === 'object') {
        DETENTE_STOCK_KINDS.forEach((k) => {
          const n = data.stock[k];
          if (Number.isInteger(n) && n >= 0) detenteState.stock[k] = Math.min(n, DETENTE_STOCK_MAX);
        });
      }
      if (Array.isArray(data.ledger)) {
        detenteState.ledger = data.ledger
          .filter((e) => e && Number.isFinite(e.t) && typeof e.label === 'string' && Number.isFinite(e.delta))
          .map((e) => ({ t: e.t, label: e.label.slice(0, 160), delta: Math.trunc(e.delta), balance: Number.isFinite(e.balance) ? Math.max(0, Math.floor(e.balance)) : null, count: Number.isInteger(e.count) && e.count > 1 ? e.count : 1 }))
          .slice(0, DETENTE_LEDGER_MAX);
      }
      if (typeof data.theme === 'string' && (data.theme === 'default' || detenteState.unlocked.includes(data.theme))) detenteState.theme = data.theme;
      if (typeof data.tab === 'string' && DETENTE_TABS.includes(data.tab)) detenteState.tab = data.tab;
      if (Number.isInteger(data.betIndex) && data.betIndex >= 0 && data.betIndex < DETENTE_BETS.length) detenteState.betIndex = data.betIndex;
      if (Number.isInteger(data.bjBetIndex) && data.bjBetIndex >= 0 && data.bjBetIndex < DETENTE_BJ_BETS.length) detenteState.bjBetIndex = data.bjBetIndex;
      if (Number.isInteger(data.chipIndex) && data.chipIndex >= 0 && data.chipIndex < DETENTE_ROULETTE_CHIPS.length) detenteState.chipIndex = data.chipIndex;
      if (Number.isFinite(data.volume)) detenteState.volume = Math.max(0, Math.min(100, Math.round(data.volume)));
      detenteState.muted = Boolean(data.muted);
      if (Array.isArray(data.history)) {
        detenteState.history = data.history
          .filter((h) => h && Array.isArray(h.symbols) && h.symbols.length === 3 && Number.isFinite(h.win))
          .slice(0, DETENTE_HISTORY_MAX);
      }
      if (Array.isArray(data.rouletteHistory)) {
        detenteState.rouletteHistory = data.rouletteHistory.filter((n) => Number.isInteger(n) && n >= 0 && n <= 36).slice(0, 12);
      }
    } catch (_) { /* stockage indisponible : on garde les valeurs par défaut */ }
  }

  function saveDetenteState() {
    try {
      localStorage.setItem(DETENTE_STORAGE_KEY, JSON.stringify({
        compte: true, // écrit par une version à comptes clients (voir getDetenteAccount)
        balance: detenteState.balance,
        debt: detenteState.debt,
        borrowed: detenteState.borrowed,
        unlocked: detenteState.unlocked,
        stock: detenteState.stock,
        ledger: detenteState.ledger,
        theme: detenteState.theme,
        tab: detenteState.tab,
        betIndex: detenteState.betIndex,
        bjBetIndex: detenteState.bjBetIndex,
        chipIndex: detenteState.chipIndex,
        volume: detenteState.volume,
        muted: detenteState.muted,
        history: detenteState.history,
        rouletteHistory: detenteState.rouletteHistory
      }));
    } catch (_) { /* quota ou mode privé : sans conséquence */ }
  }

  function formatJetons(n) {
    return String(Math.max(0, Math.floor(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function formatChipLabel(n) {
    if (n >= 1000000) return `${n / 1000000}M`;
    if (n >= 1000) return `${n / 1000}k`;
    return String(n);
  }

  // Entier uniforme dans [0, max[ par crypto.getRandomValues (rejet pour éviter le biais du modulo)
  function detenteRandomInt(max) {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const buf = new Uint32Array(1);
        const limit = Math.floor(0x100000000 / max) * max;
        do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
        return buf[0] % max;
      }
    } catch (_) { /* repli sur Math.random */ }
    return Math.floor(Math.random() * max);
  }

  // ---------- Portefeuille partagé ----------
  function detenteAddBalance(delta) {
    detenteState.balance = Math.max(0, Math.floor(detenteState.balance + delta));
    saveDetenteState();
    refreshDetenteWalletUi();
  }

  // Relevé de compte (banque, boutique, créations ; les jeux gardent leur propre historique).
  // options.merge : regroupe les écritures identiques rapprochées (« Ajouter une page ×5 »).
  function detenteLog(label, delta, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const last = detenteState.ledger[0];
    if (options.merge && last && last.label === label && now - last.t < 15 * 60 * 1000 && Math.sign(last.delta) === Math.sign(delta)) {
      last.delta += delta;
      last.count = (last.count || 1) + 1;
      last.t = now;
      last.balance = detenteState.balance;
    } else {
      detenteState.ledger.unshift({ t: now, label: String(label).slice(0, 160), delta: Math.trunc(delta), balance: detenteState.balance, count: 1 });
      if (detenteState.ledger.length > DETENTE_LEDGER_MAX) detenteState.ledger.length = DETENTE_LEDGER_MAX;
    }
    saveDetenteState();
    if (state.detentePageOpen && detenteState.tab === 'bank') renderDetenteBank();
  }

  function formatDetenteStock(kind, n) {
    const [one, many] = DETENTE_STOCK_LABELS[kind] || ['unité', 'unités'];
    return `${formatJetons(n)} ${n > 1 ? many : one}`;
  }

  function refreshDetenteWalletUi() {
    const bal = document.getElementById('detenteBalance');
    if (bal && !bal.dataset.animating) bal.textContent = formatJetons(detenteState.balance);
    const debtWrap = document.getElementById('detenteDebtWrap');
    if (debtWrap) debtWrap.classList.toggle('hidden', detenteState.debt <= 0);
    const debt = document.getElementById('detenteDebt');
    if (debt) debt.textContent = formatJetons(detenteState.debt);
    const bankDebt = document.getElementById('detenteBankDebt');
    if (bankDebt) bankDebt.textContent = formatJetons(detenteState.debt);
    const bankBorrowed = document.getElementById('detenteBankBorrowed');
    if (bankBorrowed) bankBorrowed.textContent = formatJetons(detenteState.borrowed);
    const repayBtn = document.getElementById('btnDetenteRepay');
    if (repayBtn) repayBtn.disabled = detenteState.debt <= 0 || detenteState.balance <= 0;
    const repayAllBtn = document.getElementById('btnDetenteRepayAll');
    if (repayAllBtn) repayAllBtn.disabled = detenteState.debt <= 0 || detenteState.balance <= 0;
    const hint = document.getElementById('newNotebookCostHint');
    if (hint) {
      const inStock = detenteState.stock.notebook;
      hint.textContent = inStock > 0
        ? `Coût : 1 cahier du stock (reste ${formatDetenteStock('notebook', inStock)}). Solde : ${formatJetons(detenteState.balance)} jetons.`
        : `Coût : ${DETENTE_COSTS.notebook} jetons. Solde : ${formatJetons(detenteState.balance)} jetons.`;
      hint.classList.toggle('short', inStock <= 0 && detenteState.balance < DETENTE_COSTS.notebook);
    }
    if (detenteState.funds) renderDetenteFundsModal();
    if (state.detentePageOpen) {
      renderDetenteHud();
      if (detenteState.tab === 'shop') renderDetenteShop();
      if (detenteState.tab === 'blackjack') renderBlackjackControls();
      if (detenteState.tab === 'roulette') renderRouletteControls();
      if (detenteState.tab === 'bank') renderDetenteBank();
    }
  }

  // ---------- Créations payantes (cahier, page, import PDF) ----------
  // Une unité du stock (Fournitures de la boutique) sert en priorité, sinon les jetons.
  // Le paiement est réservé avant l'action puis rendu si elle échoue ou ne crée rien.
  async function runDetentePaidCreation(cost, label, action, stockKind = null) {
    loadDetenteState();
    const fromStock = Boolean(stockKind && detenteState.stock[stockKind] > 0);
    if (!fromStock && detenteState.balance < cost) {
      openDetenteFundsModal(cost, label, action, stockKind);
      return null;
    }
    const refund = () => {
      if (fromStock) {
        detenteState.stock[stockKind] += 1;
        saveDetenteState();
        refreshDetenteWalletUi();
      } else {
        detenteAddBalance(cost);
      }
    };
    if (fromStock) {
      detenteState.stock[stockKind] -= 1;
      saveDetenteState();
      refreshDetenteWalletUi();
    } else {
      detenteAddBalance(-cost);
    }
    let result = null;
    try {
      result = await action();
    } catch (err) {
      refund();
      throw err;
    }
    if (result === null || result === undefined || result === false) refund();
    else detenteLog(fromStock ? `${label} (stock)` : label, fromStock ? 0 : -cost, { merge: true });
    return result;
  }

  function openDetenteFundsModal(cost, label, action, stockKind = null) {
    const modal = document.getElementById('modalDetenteFunds');
    detenteState.funds = { cost, label, action, stockKind };
    if (!modal) return;
    const input = document.getElementById('detenteFundsCode');
    if (input) input.value = '';
    setDetenteMessage('detenteFundsMsg', '', '');
    renderDetenteFundsModal();
    modal.classList.remove('hidden');
    setTimeout(() => { try { input && input.focus(); } catch (_) {} }, 30);
  }

  function closeDetenteFundsModal() {
    detenteState.funds = null;
    document.getElementById('modalDetenteFunds')?.classList.add('hidden');
  }

  function renderDetenteFundsModal() {
    const f = detenteState.funds;
    if (!f) return;
    const text = document.getElementById('detenteFundsText');
    if (text) {
      const missing = Math.max(0, f.cost - detenteState.balance);
      text.textContent = missing > 0
        ? `${f.label} coûte ${formatJetons(f.cost)} jeton${f.cost > 1 ? 's' : ''}. Ton solde est de ${formatJetons(detenteState.balance)} : il en manque ${formatJetons(missing)}. Saisis un code du banquier (cadeau ou prêt) pour continuer, ou demande-lui des jetons avec ton code client (Détente, onglet Banque).`
        : `${f.label} coûte ${formatJetons(f.cost)} jeton${f.cost > 1 ? 's' : ''}. Ton solde est de ${formatJetons(detenteState.balance)} : tu peux continuer.`;
    }
    const cont = document.getElementById('btnDetenteFundsContinue');
    if (cont) cont.disabled = detenteState.balance < f.cost;
  }

  async function continueDetenteFundsAction() {
    const f = detenteState.funds;
    if (!f || detenteState.balance < f.cost) return;
    closeDetenteFundsModal();
    try { await runDetentePaidCreation(f.cost, f.label, f.action, f.stockKind); } catch (_) { /* l'action affiche déjà son erreur */ }
  }

  // Points d'entrée de l'interface (les fonctions programmatiques restent gratuites pour les tests et l'amorçage)
  function paidCreateNotebook(...args) {
    return runDetentePaidCreation(DETENTE_COSTS.notebook, 'Créer un cahier', () => createNotebookProgrammatically(...args), 'notebook');
  }

  function paidAddPage(options) {
    return runDetentePaidCreation(DETENTE_COSTS.page, 'Ajouter une page', () => addNewPageToActiveNotebook(options), 'page');
  }

  function paidDuplicatePage(pageId) {
    return runDetentePaidCreation(DETENTE_COSTS.page, 'Dupliquer une page', () => duplicatePageById(pageId), 'page');
  }

  function paidImportPdf(buffer, fileName, mode) {
    return runDetentePaidCreation(DETENTE_COSTS.pdf, 'Importer un PDF', async () => {
      await importPdfFromBuffer(buffer, fileName, mode);
      return true;
    }, 'pdf');
  }

  // ---------- Codes du banquier : empreintes SHA-256 salées, usage unique par appareil ----------
  function loadDetenteUsedCodes() {
    try {
      const raw = localStorage.getItem(DETENTE_CODES_USED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.filter((h) => typeof h === 'string') : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveDetenteUsedCodes(set) {
    try { localStorage.setItem(DETENTE_CODES_USED_KEY, JSON.stringify(Array.from(set))); } catch (_) {}
  }

  function normalizeDetenteCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Retourne { ok, message, kind, amount }
  async function redeemDetenteCode(raw) {
    loadDetenteState();
    const code = normalizeDetenteCode(raw);
    if (code.length !== 12) return { ok: false, message: 'Un code compte 12 caractères (lettres et chiffres).' };
    if (typeof crypto === 'undefined' || !crypto.subtle) return { ok: false, message: 'Vérification impossible sur cet appareil.' };
    let match = null;
    for (const entry of DETENTE_CODE_BOOK) {
      const [kind, amount, salt, hash] = entry;
      // eslint-disable-next-line no-await-in-loop
      if ((await sha256Hex(`${salt}:${code}`)) === hash) { match = { kind, amount, hash }; break; }
    }
    if (!match) return { ok: false, message: 'Code inconnu.' };
    const used = loadDetenteUsedCodes();
    if (used.has(match.hash)) return { ok: false, message: 'Ce code a déjà servi sur cet appareil.' };
    used.add(match.hash);
    saveDetenteUsedCodes(used);
    if (match.kind === 'p') {
      detenteState.debt += match.amount;
      detenteState.borrowed += match.amount;
      detenteAddBalance(match.amount);
      detenteLog('Prêt par code du banquier', match.amount);
      return { ok: true, kind: 'p', amount: match.amount, message: `Prêt accordé : +${formatJetons(match.amount)} jetons. Dette : ${formatJetons(detenteState.debt)}.` };
    }
    detenteAddBalance(match.amount);
    detenteLog('Code cadeau du banquier', match.amount);
    return { ok: true, kind: 'g', amount: match.amount, message: `Code accepté : +${formatJetons(match.amount)} jeton${match.amount > 1 ? 's' : ''}.` };
  }

  async function submitDetenteCode(inputId, msgId) {
    const input = document.getElementById(inputId);
    if (!input || detenteState.codeBusy) return;
    detenteState.codeBusy = true;
    try {
      const res = await redeemDetenteCode(input.value);
      setDetenteMessage(msgId, res.message, res.ok ? 'win' : 'muted');
      if (res.ok) {
        input.value = '';
        playDetenteChime(res.amount >= 1000);
      }
    } catch (_) {
      setDetenteMessage(msgId, 'Vérification impossible.', 'muted');
    } finally {
      detenteState.codeBusy = false;
    }
  }

  // ---------- Bons du banquier publiés sur GitHub (credits/bons.json, branche main) ----------
  // Chaque bon est signé en ECDSA P-256 / SHA-256 par scripts/bons-banquier.js avec une clé
  // privée qui reste sur le PC du banquier. L'app n'embarque que la clé publique : elle vérifie
  // les bons mais ne peut pas en fabriquer. Un bon modifié, inventé ou mal signé est ignoré.
  // Bons v2 : adressés à un compte (code client de l'appareil, publié seulement sous forme
  // d'empreinte) ou à tous les comptes ouverts avant leur émission. Une installation neuve ne
  // reçoit donc ni les anciens cadeaux ni les anciens retraits.
  // Récupération mémorisée localement (pas de serveur) : un bon ne sert qu'une fois par appareil.
  // <bons-cle-publique> écrite par scripts/bons-banquier.js init : clé publique seule, la clé privée reste chez le banquier
  const DETENTE_BONS_PUBLIC_KEY = { kty: 'EC', crv: 'P-256', x: '1cFoTBrSWy0O7CjE_ml6ywJOJNXQgdV_olQlhT4Foas', y: 'lH908q2W0y4pooY9U-G1k1BOgmftzWQbhd8dVUwDhNQ' };
  // </bons-cle-publique>
  const DETENTE_BONS_SOURCES = [
    { url: 'https://api.github.com/repos/vtudkbgy/inkflow/contents/credits/bons.json?ref=main', api: true },
    { url: 'https://raw.githubusercontent.com/vtudkbgy/inkflow/main/credits/bons.json', api: false }
  ];
  const DETENTE_BONS_CLAIMED_KEY = 'inkflow.detente.bonsRecus.v1';
  const DETENTE_ACCOUNT_KEY = 'inkflow.detente.compte.v1';
  const DETENTE_RETRAITS_KEY = 'inkflow.detente.retraits.v1'; // part de chaque retrait passée en dette
  // 32 symboles sans 0/1/I/O (pas de confusion à la dictée) : 10 symboles = 50 bits
  const DETENTE_ACCOUNT_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const DETENTE_ACCOUNT_CODE_LEN = 10;
  const DETENTE_BONS_POLL_MS = 10 * 60 * 1000;
  const DETENTE_BONS_MIN_REFRESH_MS = 30 * 1000;
  const DETENTE_BONS_MAX_AMOUNT = 10000000;
  const DETENTE_BONS_MAX_MESSAGE = 140;
  const DETENTE_BON_TYPES = ['cadeau', 'pret', 'retrait', 'annulation'];
  const detenteBons = { list: [], fetching: null, lastFetch: 0, lastOk: 0, started: false, claiming: new Set(), notified: new Set() };
  let detenteBonsKeyPromise = null;
  let detenteAccount = null;

  // ---------- Compte de l'appareil (code client) ----------
  function newDetenteAccountCode() {
    const bytes = new Uint8Array(DETENTE_ACCOUNT_CODE_LEN);
    try { crypto.getRandomValues(bytes); } catch (_) { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += DETENTE_ACCOUNT_ALPHABET[bytes[i] & 31];
    return out;
  }

  function normalizeDetenteAccountCode(raw) {
    const code = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (code.length !== DETENTE_ACCOUNT_CODE_LEN) return '';
    for (const ch of code) if (!DETENTE_ACCOUNT_ALPHABET.includes(ch)) return '';
    return code;
  }

  function formatDetenteAccountCode(code) {
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  }

  // Un appareil qui avait déjà un portefeuille avant l'arrivée des comptes est « ancien » : il
  // garde les bons v1 (non adressés) qu'il connaissait. Une installation neuve ne les voit pas.
  function getDetenteAccount() {
    if (detenteAccount) return detenteAccount;
    let acc = null;
    try {
      const raw = localStorage.getItem(DETENTE_ACCOUNT_KEY);
      const data = raw ? JSON.parse(raw) : null;
      const code = data && normalizeDetenteAccountCode(data.code);
      if (code && Number.isFinite(data.creeLe) && data.creeLe >= 0) acc = { code, creeLe: data.creeLe, ancien: Boolean(data.ancien) };
    } catch (_) { acc = null; }
    if (!acc) {
      let legacy = false;
      // Ancien seulement si le portefeuille a été écrit par une version sans comptes (pas de
      // marque « compte ») : un compte perdu sur un portefeuille récent ne rouvre pas les bons v1
      try {
        const walletRaw = localStorage.getItem(DETENTE_STORAGE_KEY);
        if (walletRaw) {
          const wallet = JSON.parse(walletRaw);
          legacy = Boolean(wallet && typeof wallet === 'object' && !wallet.compte);
        } else {
          legacy = Boolean(localStorage.getItem(DETENTE_BONS_CLAIMED_KEY));
        }
      } catch (_) { legacy = false; }
      acc = { code: newDetenteAccountCode(), creeLe: legacy ? 0 : Date.now(), ancien: legacy };
      try { localStorage.setItem(DETENTE_ACCOUNT_KEY, JSON.stringify(acc)); } catch (_) { /* compte de session seulement */ }
    }
    detenteAccount = acc;
    return acc;
  }

  // Empreinte publiée dans les bons (champ « pour ») : le code lui-même n'apparaît jamais sur GitHub
  async function detenteAccountHash(code) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`inkflow-compte-v1:${code}`));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  }

  async function getDetenteAccountHash(account) {
    if (!account.hash) account.hash = await detenteAccountHash(account.code);
    return account.hash;
  }

  // Texte signé : doit rester identique à bonPayload() dans scripts/bons-banquier.js
  function detenteBonPayload(bon) {
    if (bon.v === 2) {
      return ['inkflow-bon-v2', bon.id, bon.type, String(bon.montant), bon.expire || '', bon.emis, bon.pour || '', bon.annule || '', bon.message || ''].join('\n');
    }
    return ['inkflow-bon-v1', bon.id, bon.type, String(bon.montant), bon.expire || '', bon.message || ''].join('\n');
  }

  function detenteBase64UrlToBytes(s) {
    const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function isDetenteBonShapeValid(bon) {
    const base = Boolean(bon && typeof bon === 'object'
      && typeof bon.id === 'string' && /^[a-z0-9-]{6,40}$/.test(bon.id)
      && Number.isInteger(bon.montant) && bon.montant >= 1 && bon.montant <= DETENTE_BONS_MAX_AMOUNT
      && (bon.expire === undefined || (typeof bon.expire === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bon.expire)))
      && (bon.message === undefined || (typeof bon.message === 'string' && bon.message.length <= DETENTE_BONS_MAX_MESSAGE))
      && typeof bon.sig === 'string' && bon.sig.length >= 80 && bon.sig.length <= 100);
    if (!base) return false;
    if (bon.v === undefined) {
      return (bon.type === 'cadeau' || bon.type === 'pret' || bon.type === 'retrait')
        && bon.emis === undefined && bon.pour === undefined && bon.annule === undefined;
    }
    return bon.v === 2
      && DETENTE_BON_TYPES.includes(bon.type)
      && typeof bon.emis === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(bon.emis) && Number.isFinite(Date.parse(bon.emis))
      && (bon.pour === undefined || (typeof bon.pour === 'string' && /^[0-9a-f]{24}$/.test(bon.pour)))
      && (bon.type === 'annulation'
        ? (typeof bon.annule === 'string' && /^[a-z0-9-]{6,40}$/.test(bon.annule) && bon.annule !== bon.id)
        : bon.annule === undefined);
  }

  function isDetenteBonExpired(bon, now) {
    if (!bon.expire) return false;
    const end = new Date(`${bon.expire}T23:59:59`).getTime();
    return Number.isFinite(end) && end < now;
  }

  function getDetenteBonsKey(jwk) {
    const subtle = crypto.subtle;
    const algo = { name: 'ECDSA', namedCurve: 'P-256' };
    if (jwk && jwk !== DETENTE_BONS_PUBLIC_KEY) return subtle.importKey('jwk', jwk, algo, false, ['verify']);
    if (!detenteBonsKeyPromise) {
      detenteBonsKeyPromise = subtle.importKey('jwk', DETENTE_BONS_PUBLIC_KEY, algo, false, ['verify'])
        .catch((err) => { detenteBonsKeyPromise = null; throw err; });
    }
    return detenteBonsKeyPromise;
  }

  // Retourne les bons de ce compte : forme correcte, non expirés, signature valide, et
  // - v2 adressé : empreinte « pour » égale à celle du code client de l'appareil ;
  // - v2 pour tous : émis après l'ouverture du compte ;
  // - v1 (ancien format, pour tous) : seulement sur un appareil déjà en service avant les comptes.
  // options.account : compte injecté par les tests ({ code, creeLe, ancien }).
  async function verifyDetenteBons(doc, options = {}) {
    const jwk = options.publicKey || DETENTE_BONS_PUBLIC_KEY;
    if (!jwk.x || !jwk.y) return [];
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.bons)) return [];
    if (typeof crypto === 'undefined' || !crypto.subtle) return [];
    const key = await getDetenteBonsKey(options.publicKey);
    const account = options.account || getDetenteAccount();
    const myHash = await getDetenteAccountHash(account);
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const seen = new Set();
    const valid = [];
    // Les bons récents sont en fin de fichier : au-delà de 300, ce sont les plus anciens qui sont ignorés
    for (const bon of doc.bons.slice(-300)) {
      if (!isDetenteBonShapeValid(bon) || seen.has(bon.id) || isDetenteBonExpired(bon, now)) continue;
      if (bon.v === 2) {
        if (bon.pour ? bon.pour !== myHash : Date.parse(bon.emis) < account.creeLe) continue;
      } else if (!account.ancien) {
        continue;
      }
      let ok = false;
      try {
        // eslint-disable-next-line no-await-in-loop
        ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
          detenteBase64UrlToBytes(bon.sig), new TextEncoder().encode(detenteBonPayload(bon)));
      } catch (_) { ok = false; }
      if (!ok) continue;
      seen.add(bon.id);
      valid.push({
        id: bon.id,
        type: bon.type,
        montant: bon.montant,
        expire: bon.expire || '',
        message: bon.message || '',
        annule: bon.annule || '',
        personnel: Boolean(bon.pour)
      });
    }
    return valid;
  }

  function loadDetenteClaimedBons() {
    try {
      const raw = localStorage.getItem(DETENTE_BONS_CLAIMED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.filter((id) => typeof id === 'string') : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveDetenteClaimedBons(set) {
    try { localStorage.setItem(DETENTE_BONS_CLAIMED_KEY, JSON.stringify(Array.from(set).slice(-1000))); } catch (_) {}
  }

  function getDetentePendingBons() {
    const claimed = loadDetenteClaimedBons();
    return detenteBons.list.filter((b) => !claimed.has(b.id) && !detenteBons.claiming.has(b.id));
  }

  // null : aucune source joignable (hors-ligne) ; on garde alors la dernière liste connue
  async function fetchDetenteBonsDocument() {
    if (typeof fetch !== 'function') return null;
    for (const src of DETENTE_BONS_SOURCES) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(src.api ? src.url : `${src.url}?t=${Date.now()}`, {
          cache: 'no-store',
          headers: src.api ? { Accept: 'application/vnd.github.raw+json' } : {}
        });
        if (res.status === 404) return { bons: [] };
        if (!res.ok) continue;
        // eslint-disable-next-line no-await-in-loop
        return await res.json();
      } catch (_) { /* hors-ligne, quota de l'API ou réponse illisible : source suivante */ }
    }
    return null;
  }

  // options.document : document déjà lu (tests) ; options.publicKey / options.now / options.account : injectés par les tests
  function refreshDetenteBons(options = {}) {
    if (detenteBons.fetching) return detenteBons.fetching;
    detenteBons.lastFetch = Date.now();
    detenteBons.fetching = (async () => {
      try {
        const doc = options.document !== undefined ? options.document : await fetchDetenteBonsDocument();
        if (doc) {
          detenteBons.list = await verifyDetenteBons(doc, options);
          detenteBons.lastOk = Date.now();
          applyDetenteAutoBons();
          renderDetenteBons();
          if (state.detentePageOpen && detenteState.tab === 'bank') renderDetenteBank();
        }
      } catch (_) { /* vérification impossible : la liste précédente reste affichée */ }
      return getDetentePendingBons().filter((b) => b.type === 'cadeau' || b.type === 'pret');
    })().finally(() => { detenteBons.fetching = null; });
    return detenteBons.fetching;
  }

  function startDetenteBonsPolling() {
    if (detenteBons.started) return;
    if (typeof fetch !== 'function' || typeof crypto === 'undefined' || !crypto.subtle) return;
    if (!DETENTE_BONS_PUBLIC_KEY.x) return;
    detenteBons.started = true;
    getDetenteAccount();
    const tick = () => {
      setTimeout(tick, DETENTE_BONS_POLL_MS);
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshDetenteBons();
    };
    setTimeout(tick, 4000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - detenteBons.lastFetch > DETENTE_BONS_POLL_MS) refreshDetenteBons();
    });
  }

  function describeDetenteBon(bon) {
    const plural = bon.montant > 1 ? 's' : '';
    return bon.type === 'pret'
      ? `Prêt de ${formatJetons(bon.montant)} jeton${plural}`
      : `${formatJetons(bon.montant)} jeton${plural} offert${plural}`;
  }

  function renderDetenteBons() {
    const pending = getDetentePendingBons().filter((b) => b.type === 'cadeau' || b.type === 'pret');
    const total = pending.reduce((sum, b) => sum + b.montant, 0);
    const sideBtn = document.getElementById('btnOpenDetente');
    if (sideBtn) {
      sideBtn.classList.toggle('has-bon', pending.length > 0);
      sideBtn.title = pending.length > 0
        ? `Détente : le banquier t’a envoyé ${formatJetons(total)} jetons à récupérer (Maj+J)`
        : 'Détente : jeux, boutique et banque, jetons fictifs (Maj+J)';
    }
    // Petite notification, une fois par bon et par session, si la page Détente est fermée
    const fresh = pending.filter((b) => !detenteBons.notified.has(b.id));
    fresh.forEach((b) => detenteBons.notified.add(b.id));
    if (fresh.length && !state.detentePageOpen && typeof showToast === 'function') {
      const sum = fresh.reduce((s, b) => s + b.montant, 0);
      showToast(`Le banquier t’a envoyé ${formatJetons(sum)} jetons : ouvre Détente pour les récupérer.`, 'info', 'detente-bons');
    }

    const wrap = document.getElementById('detenteBons');
    if (!wrap || typeof wrap.querySelectorAll !== 'function') return;
    const shownIds = new Set(pending.map((b) => b.id));
    // Retire les bons disparus du fichier ou annulés (sauf celui en cours d'animation)
    wrap.querySelectorAll('.detente-bon').forEach((el) => {
      if (!shownIds.has(el.dataset.bonId) && !el.classList.contains('claimed')) el.remove();
    });
    pending.forEach((bon) => {
      if (wrap.querySelector(`.detente-bon[data-bon-id="${bon.id}"]`)) return;
      const item = document.createElement('div');
      item.className = 'detente-bon';
      item.dataset.bonId = bon.id;
      const text = document.createElement('div');
      text.className = 'detente-bon-text';
      const from = document.createElement('span');
      from.className = 'detente-label';
      from.textContent = bon.type === 'pret' ? 'Prêt du banquier' : 'Du banquier';
      const amount = document.createElement('strong');
      amount.className = 'detente-bon-amount';
      amount.textContent = describeDetenteBon(bon);
      text.appendChild(from);
      text.appendChild(amount);
      if (bon.message) {
        const msg = document.createElement('span');
        msg.className = 'detente-bon-msg';
        msg.textContent = bon.message;
        text.appendChild(msg);
      }
      if (bon.type === 'pret') {
        const note = document.createElement('span');
        note.className = 'detente-bon-msg';
        note.textContent = 'La même somme s’ajoute à ta dette.';
        text.appendChild(note);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'detente-spin-btn detente-bon-btn';
      btn.dataset.bonClaim = bon.id;
      btn.textContent = `Récupérer ${formatJetons(bon.montant)} jeton${bon.montant > 1 ? 's' : ''}`;
      item.appendChild(text);
      item.appendChild(btn);
      wrap.appendChild(item);
    });
    wrap.classList.toggle('hidden', !wrap.querySelector('.detente-bon'));
  }

  // Crédite le bon une seule fois : l'identifiant est mémorisé avant le crédit
  function claimDetenteBon(id) {
    if (detenteBons.claiming.has(id)) return false;
    const bon = getDetentePendingBons().find((b) => b.id === id);
    if (!bon || (bon.type !== 'cadeau' && bon.type !== 'pret')) return false;
    loadDetenteState();
    detenteBons.claiming.add(id);
    const claimed = loadDetenteClaimedBons();
    claimed.add(id);
    saveDetenteClaimedBons(claimed);
    const start = detenteState.balance;
    if (bon.type === 'pret') {
      detenteState.debt += bon.montant;
      detenteState.borrowed += bon.montant;
    }
    detenteAddBalance(bon.montant);
    detenteLog(bon.type === 'pret' ? 'Prêt du banquier' : (bon.message ? `Cadeau du banquier : ${bon.message}` : 'Cadeau du banquier'), bon.montant);
    if (state.detentePageOpen) {
      animateDetenteBalance(start, detenteState.balance);
      playDetenteChime(bon.montant >= 1000);
    }
    animateDetenteBonOut(id, bon);
    return true;
  }

  // Débit sans passer sous zéro : ce qui manque s'ajoute à la dette
  function detenteDebitOrDebt(amount) {
    const fromBalance = Math.min(amount, detenteState.balance);
    const toDebt = amount - fromBalance;
    if (toDebt > 0) detenteState.debt += toDebt;
    detenteAddBalance(-fromBalance);
    return { fromBalance, toDebt };
  }

  // Retraits et annulations : appliqués sans clic, une seule fois par appareil (identifiant
  // mémorisé avant l'effet), dans l'ordre du fichier.
  // Annulation d'un bon pas encore récupéré : il disparaît sans rien coûter.
  // Annulation d'un bon déjà récupéré : l'opération est inversée (cadeau ou prêt repris, retrait
  // rendu, part passée en dette comprise ; pour un prêt, seule la part encore due est reprise).
  // Une cible ne s'annule qu'une fois (marqueur « annule:<id> » dans les bons appliqués).
  function loadDetenteRetraitEffects() {
    try {
      const data = JSON.parse(localStorage.getItem(DETENTE_RETRAITS_KEY) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (_) {
      return {};
    }
  }

  function saveDetenteRetraitEffect(id, toDebt) {
    const all = loadDetenteRetraitEffects();
    all[id] = toDebt;
    const keys = Object.keys(all);
    keys.slice(0, Math.max(0, keys.length - 300)).forEach((k) => { delete all[k]; });
    try { localStorage.setItem(DETENTE_RETRAITS_KEY, JSON.stringify(all)); } catch (_) {}
  }

  function applyDetenteAutoBons() {
    const auto = getDetentePendingBons().filter((b) => b.type === 'retrait' || b.type === 'annulation');
    if (!auto.length) return [];
    loadDetenteState();
    const claimed = loadDetenteClaimedBons();
    // Cibles pas encore appliquées d'une annulation en attente (appareil resté hors ligne) :
    // elles sont neutralisées d'emblée, même si elles précèdent l'annulation dans le fichier
    const voidedEarly = new Set();
    auto.forEach((a) => {
      if (a.type !== 'annulation' || claimed.has(`annule:${a.annule}`)) return;
      const t = detenteBons.list.find((b) => b.id === a.annule);
      if (t && t.type !== 'annulation' && !claimed.has(t.id) && !detenteBons.claiming.has(t.id)) voidedEarly.add(t.id);
    });
    const applied = [];
    for (const bon of auto) {
      if (claimed.has(bon.id)) continue;
      claimed.add(bon.id);
      saveDetenteClaimedBons(claimed);
      const note = bon.message ? ` : ${bon.message}` : '';
      if (bon.type === 'retrait') {
        if (voidedEarly.has(bon.id)) continue; // l'annulation qui suit le signale
        const r = detenteDebitOrDebt(bon.montant);
        saveDetenteRetraitEffect(bon.id, r.toDebt);
        detenteLog(`Retrait du banquier${r.toDebt > 0 ? ` (${formatJetons(r.toDebt)} en dette)` : ''}${note}`, -r.fromBalance);
        applied.push({ id: bon.id, kind: 'retrait', montant: bon.montant, toDebt: r.toDebt, message: bon.message });
        continue;
      }
      const target = detenteBons.list.find((b) => b.id === bon.annule);
      const marker = `annule:${bon.annule}`;
      if (!target || target.type === 'annulation' || claimed.has(marker)) {
        applied.push({ id: bon.id, kind: 'sans-effet', montant: 0, toDebt: 0, message: '' });
        continue;
      }
      claimed.add(marker);
      saveDetenteClaimedBons(claimed);
      if (voidedEarly.has(target.id) || (!claimed.has(target.id) && !detenteBons.claiming.has(target.id))) {
        // Pas encore récupéré (ou retrait pas encore appliqué) : il ne s'appliquera jamais
        claimed.add(target.id);
        saveDetenteClaimedBons(claimed);
        detenteLog(`Bon annulé avant récupération (${formatJetons(target.montant)} jetons)${note}`, 0);
        applied.push({ id: bon.id, kind: 'annule-avant', montant: target.montant, toDebt: 0, message: bon.message });
        continue;
      }
      if (target.type === 'retrait') {
        // Rend ce que le retrait a réellement pris : le solde débité, et la dette créée
        const effects = loadDetenteRetraitEffects();
        const wentToDebt = Math.min(target.montant, Number.isInteger(effects[target.id]) ? effects[target.id] : 0);
        const debtBack = Math.min(wentToDebt, detenteState.debt);
        detenteState.debt -= debtBack;
        const back = target.montant - wentToDebt;
        detenteAddBalance(back);
        detenteLog(`Retrait annulé, jetons rendus${debtBack > 0 ? ` (dette réduite de ${formatJetons(debtBack)})` : ''}${note}`, back);
        applied.push({ id: bon.id, kind: 'rendu', montant: back, toDebt: 0, message: bon.message });
        continue;
      }
      // Prêt : solde moins dette n'avait pas bougé à la récupération ; on ne reprend que la part
      // encore due (un prêt déjà remboursé ne coûte rien de plus)
      let take = target.montant;
      if (target.type === 'pret') {
        take = Math.min(target.montant, detenteState.debt);
        detenteState.debt -= take;
        detenteState.borrowed = Math.max(0, detenteState.borrowed - target.montant);
      }
      const r = detenteDebitOrDebt(take);
      detenteLog(`${target.type === 'pret' ? 'Prêt' : 'Cadeau'} annulé par le banquier${r.toDebt > 0 ? ` (${formatJetons(r.toDebt)} en dette)` : ''}${note}`, -r.fromBalance);
      applied.push({ id: bon.id, kind: 'repris', montant: take, toDebt: r.toDebt, message: bon.message });
    }
    const visible = applied.filter((a) => a.kind !== 'sans-effet');
    if (!visible.length) return applied;
    const taken = visible.filter((a) => a.kind === 'retrait' || a.kind === 'repris').reduce((s, a) => s + a.montant, 0);
    const given = visible.filter((a) => a.kind === 'rendu').reduce((s, a) => s + a.montant, 0);
    const voided = visible.filter((a) => a.kind === 'annule-avant');
    const debtTotal = visible.reduce((s, a) => s + a.toDebt, 0);
    const parts = [];
    if (taken > 0) parts.push(`Le banquier t’a retiré ${formatJetons(taken)} jeton${taken > 1 ? 's' : ''}.`);
    if (given > 0) parts.push(`Le banquier t’a rendu ${formatJetons(given)} jeton${given > 1 ? 's' : ''}.`);
    if (voided.length) parts.push(voided.length > 1 ? `${voided.length} bons en attente ont été annulés.` : 'Un bon en attente a été annulé.');
    if (debtTotal > 0) parts.push(`Solde insuffisant : ${formatJetons(debtTotal)} ajouté${debtTotal > 1 ? 's' : ''} à ta dette.`);
    const msgs = visible.map((a) => a.message).filter(Boolean);
    if (msgs.length) parts.push(`« ${msgs.join(' » « ')} »`);
    if (parts.length && typeof showToast === 'function') showToast(parts.join(' '), 'info', 'detente-retraits');
    return applied;
  }

  // ---------- Onglet Banque : compte, stock et relevé ----------
  function renderDetenteBank() {
    const account = getDetenteAccount();
    const codeEl = document.getElementById('detenteAccountCode');
    if (codeEl) codeEl.textContent = formatDetenteAccountCode(account.code);
    const sync = document.getElementById('detenteAccountSync');
    if (sync) {
      sync.textContent = detenteBons.lastOk
        ? `Dernière vérification des envois du banquier : ${new Date(detenteBons.lastOk).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`
        : 'Envois du banquier pas encore vérifiés (connexion Internet nécessaire).';
    }
    const stockEl = document.getElementById('detenteStockList');
    if (stockEl) {
      stockEl.innerHTML = DETENTE_STOCK_KINDS.map((k) => {
        const many = DETENTE_STOCK_LABELS[k][1];
        return `<li><span>${escapeHtml(many.charAt(0).toUpperCase() + many.slice(1))} en stock</span><strong>${formatJetons(detenteState.stock[k])}</strong></li>`;
      }).join('');
    }
    const list = document.getElementById('detenteLedger');
    if (!list) return;
    if (!detenteState.ledger.length) {
      list.innerHTML = '<li class="detente-ledger-empty">Aucune opération pour l’instant.</li>';
      return;
    }
    list.innerHTML = detenteState.ledger.map((e) => {
      const d = new Date(e.t);
      const when = `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      const sign = e.delta > 0 ? '+' : (e.delta < 0 ? '−' : '');
      const tone = e.delta > 0 ? 'in' : (e.delta < 0 ? 'out' : 'zero');
      const label = e.count > 1 ? `${e.label} ×${e.count}` : e.label;
      const bal = Number.isFinite(e.balance) ? `<span class="detente-ledger-bal">solde ${formatJetons(e.balance)}</span>` : '';
      return `<li><span class="detente-ledger-when">${escapeHtml(when)}</span><span class="detente-ledger-label">${escapeHtml(label)}</span><strong class="detente-ledger-delta ${tone}">${sign}${formatJetons(Math.abs(e.delta))}</strong>${bal}</li>`;
    }).join('');
  }

  async function copyDetenteAccountCode() {
    const code = formatDetenteAccountCode(getDetenteAccount().code);
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(code); ok = true; }
    } catch (_) { ok = false; }
    if (typeof showToast === 'function') showToast(ok ? `Code client copié : ${code}` : `Ton code client : ${code}`, 'info', 'detente-compte');
  }

  function animateDetenteBonOut(id, bon) {
    const wrap = document.getElementById('detenteBons');
    const item = wrap && typeof wrap.querySelector === 'function' ? wrap.querySelector(`.detente-bon[data-bon-id="${id}"]`) : null;
    const finish = () => {
      if (item && item.parentNode) item.remove();
      detenteBons.claiming.delete(id);
      renderDetenteBons();
    };
    if (!item || isDetenteReducedMotion()) { finish(); return; }
    const btn = item.querySelector('.detente-bon-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = `+${formatJetons(bon.montant)}`;
    }
    const burst = document.createElement('span');
    burst.className = 'detente-bon-float';
    burst.setAttribute('aria-hidden', 'true');
    burst.textContent = `+${formatJetons(bon.montant)}`;
    item.appendChild(burst);
    item.style.height = `${item.offsetHeight}px`;
    item.classList.add('claimed');
    setTimeout(() => {
      item.classList.add('collapsing');
      item.style.height = '0px';
    }, 520);
    setTimeout(finish, 1000);
  }

  function repayDetenteDebt(all) {
    if (detenteState.debt <= 0) return;
    let amount = detenteState.debt;
    if (!all) {
      const input = document.getElementById('detenteRepayAmount');
      amount = Math.floor(Number(input && input.value) || 0);
      if (amount <= 0) { setDetenteMessage('detenteBankMsg', 'Indique un montant à rembourser.', 'muted'); return; }
    }
    amount = Math.min(amount, detenteState.debt, detenteState.balance);
    if (amount <= 0) { setDetenteMessage('detenteBankMsg', 'Solde vide : rien à rembourser pour l’instant.', 'muted'); return; }
    detenteState.debt -= amount;
    detenteAddBalance(-amount);
    detenteLog('Remboursement de dette', -amount);
    const input = document.getElementById('detenteRepayAmount');
    if (input) input.value = '';
    setDetenteMessage('detenteBankMsg', detenteState.debt > 0
      ? `Remboursé : ${formatJetons(amount)} jetons. Reste dû : ${formatJetons(detenteState.debt)}.`
      : `Remboursé : ${formatJetons(amount)} jetons. Dette soldée.`, 'win');
  }

  // ---------- Boutique ----------
  function isDetenteUnlocked(id) {
    return detenteState.unlocked.includes(id);
  }

  function buyDetenteItem(id) {
    loadDetenteState();
    const item = DETENTE_SHOP.find((it) => it.id === id);
    if (!item || (item.kind !== 'pack' && isDetenteUnlocked(id))) return false;
    if (detenteState.balance < item.price) {
      setDetenteMessage('detenteShopMsg', `Il manque ${formatJetons(item.price - detenteState.balance)} jetons pour « ${item.label} ». Un code ou un prêt à la Banque peut aider.`, 'muted');
      return false;
    }
    if (item.kind === 'pack') {
      // Fourniture : achat répétable, ajouté au stock (rien n'est « débloqué »)
      detenteState.stock[item.stock] = Math.min(DETENTE_STOCK_MAX, detenteState.stock[item.stock] + item.qty);
      detenteAddBalance(-item.price);
      detenteLog(`Boutique : ${item.label}`, -item.price);
      setDetenteMessage('detenteShopMsg', `« ${item.label} » ajouté au stock : ${formatDetenteStock(item.stock, detenteState.stock[item.stock])} disponibles.`, 'win');
      playDetenteChime(false);
      renderDetenteShop();
      return true;
    }
    detenteState.unlocked.push(id);
    if (item.kind === 'theme') detenteState.theme = id;
    detenteAddBalance(-item.price);
    detenteLog(`Boutique : ${item.label}`, -item.price);
    applyDetenteUnlocks();
    setDetenteMessage('detenteShopMsg', `« ${item.label} » débloqué.`, 'win');
    playDetenteChime(false);
    renderDetenteShop();
    return true;
  }

  function setDetenteTheme(id) {
    if (id !== 'default' && !isDetenteUnlocked(id)) return;
    detenteState.theme = id;
    saveDetenteState();
    applyDetenteTheme();
    renderDetenteShop();
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function applyDetenteTheme() {
    let styleEl = document.getElementById('detenteThemeStyle');
    const item = DETENTE_SHOP.find((it) => it.id === detenteState.theme && it.kind === 'theme');
    if (!item) {
      if (styleEl) styleEl.remove();
      return;
    }
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'detenteThemeStyle';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `:root:root:not([data-theme="dark"]){--accent-primary:${item.light};--accent-primary-dark:${item.lightDark};--accent-primary-soft:${hexToRgba(item.light, 0.13)};}`
      + `:root:root[data-theme="dark"]{--accent-primary:${item.dark};--accent-primary-dark:${item.darkDark};--accent-primary-soft:${hexToRgba(item.dark, 0.2)};}`;
  }

  function applyDetenteUnlocks() {
    applyDetenteTheme();
    // Teintes de papier : boutons cachés du menu Papier
    document.querySelectorAll('[data-detente-item]').forEach((el) => {
      el.classList.toggle('hidden', !isDetenteUnlocked(el.dataset.detenteItem));
    });
    // Couvertures : pastilles dans « Nouveau cahier »
    const wrap = document.getElementById('notebookCoverSwatches');
    if (wrap) {
      const addBtn = document.getElementById('btnAddNotebookCoverColor');
      DETENTE_SHOP.filter((it) => it.kind === 'cover' && isDetenteUnlocked(it.id)).forEach((it) => {
        if (wrap.querySelector(`[data-detente-cover="${it.id}"]`)) return;
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'color-swatch';
        sw.dataset.cover = it.coverColor;
        sw.dataset.detenteCover = it.id;
        sw.title = it.label;
        sw.setAttribute('aria-label', `Couverture ${it.label}`);
        sw.style.background = `linear-gradient(135deg, ${it.coverColor}, ${it.accent})`;
        sw.addEventListener('click', () => {
          state.newNotebookCover = it.coverColor;
          wrap.querySelectorAll('[data-cover]').forEach((s) => s.classList.toggle('active', s === sw));
        });
        wrap.insertBefore(sw, addBtn || null);
      });
    }
    // Couvertures : groupe de la bibliothèque de couvertures
    try {
      const items = DETENTE_SHOP.filter((it) => it.kind === 'cover' && isDetenteUnlocked(it.id))
        .map((it) => ({ id: `detente-${it.id}`, label: it.label, coverColor: it.coverColor, accent: it.accent, style: it.style }));
      const idx = GN_COVER_TEMPLATE_GROUPS.findIndex((g) => g.id === 'detente-shop');
      if (idx >= 0) GN_COVER_TEMPLATE_GROUPS.splice(idx, 1);
      if (items.length) GN_COVER_TEMPLATE_GROUPS.push({ id: 'detente-shop', title: 'Boutique Détente', items });
    } catch (_) { /* bibliothèque pas encore initialisée */ }
  }

  function detenteShopPreview(item) {
    if (item.kind === 'theme') {
      return `<span class="detente-shop-preview theme" style="--prev-a:${item.light};--prev-b:${item.dark}"><span></span><span></span></span>`;
    }
    if (item.kind === 'tone') {
      return `<span class="detente-shop-preview tone" style="background:${item.swatch}"></span>`;
    }
    if (item.kind === 'pack') {
      return `<span class="detente-shop-preview pack"><strong>×${item.qty}</strong><span>${escapeHtml(DETENTE_STOCK_LABELS[item.stock][1])}</span></span>`;
    }
    return `<span class="detente-shop-preview cover" style="background:linear-gradient(135deg, ${item.coverColor}, ${item.accent})"></span>`;
  }

  function renderDetenteShop() {
    const root = document.getElementById('detenteShopGroups');
    if (!root) return;
    let html = '';
    DETENTE_SHOP_GROUPS.forEach((g) => {
      html += `<section class="detente-card detente-shop-group"><h3 class="detente-card-title">${escapeHtml(g.title)}</h3><p class="detente-note detente-note-top">${escapeHtml(g.note)}</p><div class="detente-shop-grid">`;
      if (g.kind === 'theme') {
        const active = detenteState.theme === 'default';
        html += `<div class="detente-shop-item${active ? ' active' : ''}"><span class="detente-shop-preview theme" style="--prev-a:#0072ce;--prev-b:#0c8cf3"><span></span><span></span></span><span class="detente-shop-name">Bleu InkFlow</span><button type="button" class="detente-chip-btn" data-detente-theme="default"${active ? ' disabled' : ''}>${active ? 'Actif' : 'Activer'}</button></div>`;
      }
      DETENTE_SHOP.filter((it) => it.kind === g.kind).forEach((it) => {
        if (it.kind === 'pack') {
          const unit = DETENTE_COSTS[it.stock] * it.qty;
          const saving = unit > it.price ? `<span class="detente-shop-meta">au lieu de ${formatJetons(unit)} à l’unité</span>` : '';
          const have = detenteState.stock[it.stock];
          html += `<div class="detente-shop-item pack">${detenteShopPreview(it)}<span class="detente-shop-name">${escapeHtml(it.label)}</span>${saving}`
            + `<span class="detente-shop-meta">En stock : ${formatDetenteStock(it.stock, have)}</span>`
            + `<button type="button" class="detente-chip-btn buy" data-detente-buy="${it.id}"${detenteState.balance < it.price ? ' data-short="1"' : ''}>${formatJetons(it.price)} jetons</button></div>`;
          return;
        }
        const owned = isDetenteUnlocked(it.id);
        let btn;
        if (!owned) {
          btn = `<button type="button" class="detente-chip-btn buy" data-detente-buy="${it.id}"${detenteState.balance < it.price ? ' data-short="1"' : ''}>${formatJetons(it.price)} jetons</button>`;
        } else if (it.kind === 'theme') {
          const active = detenteState.theme === it.id;
          btn = `<button type="button" class="detente-chip-btn" data-detente-theme="${it.id}"${active ? ' disabled' : ''}>${active ? 'Actif' : 'Activer'}</button>`;
        } else {
          btn = '<span class="detente-shop-owned">Débloqué</span>';
        }
        const active = it.kind === 'theme' && owned && detenteState.theme === it.id;
        html += `<div class="detente-shop-item${owned ? ' owned' : ''}${active ? ' active' : ''}">${detenteShopPreview(it)}<span class="detente-shop-name">${escapeHtml(it.label)}</span>${btn}</div>`;
      });
      html += '</div></section>';
    });
    root.innerHTML = html;
  }

  // ---------- Machine à sous ----------
  // Bande de 21 cases (somme des poids), entrelacée pour éviter les suites d'un même symbole
  function buildDetenteStrip() {
    const pool = [];
    DETENTE_SYMBOLS.forEach((sym, idx) => { for (let i = 0; i < sym.weight; i++) pool.push(idx); });
    const strip = [];
    const counts = DETENTE_SYMBOLS.map((s) => s.weight);
    while (strip.length < pool.length) {
      let best = -1;
      for (let i = 0; i < counts.length; i++) {
        if (!counts[i]) continue;
        if (strip.length && strip[strip.length - 1] === i && counts.some((c, j) => c && j !== i)) continue;
        if (best < 0 || counts[i] > counts[best]) best = i;
      }
      strip.push(best);
      counts[best]--;
    }
    return strip;
  }

  function detenteSymbolSvg(symIdx, size = 48) {
    const sym = DETENTE_SYMBOLS[symIdx];
    return `<svg class="detente-sym detente-sym-${sym.id}" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${sym.svg}</svg>`;
  }

  function evaluateDetenteLine(symbols) {
    const [a, b, c] = symbols;
    const plumeIdx = DETENTE_SYMBOLS.length - 1;
    if (a === b && b === c) return { mult: DETENTE_SYMBOLS[a].mult, cells: [0, 1, 2], kind: 'triple' };
    const plumes = symbols.map((s, i) => (s === plumeIdx ? i : -1)).filter((i) => i >= 0);
    if (plumes.length === 2) return { mult: DETENTE_TWO_PLUMES_MULT, cells: plumes, kind: 'plumes' };
    if (a === b) return { mult: DETENTE_PAIR_MULT, cells: [0, 1], kind: 'pair' };
    if (b === c) return { mult: DETENTE_PAIR_MULT, cells: [1, 2], kind: 'pair' };
    return { mult: 0, cells: [], kind: 'none' };
  }

  function getDetenteBet() {
    return DETENTE_BETS[detenteState.betIndex];
  }

  function renderDetenteReels() {
    const n = detenteState.strip.length;
    document.querySelectorAll('#detenteReels .detente-reel').forEach((reelEl, r) => {
      const stripEl = reelEl.querySelector('.detente-strip');
      if (!stripEl) return;
      if (!stripEl.childElementCount) {
        // 3 copies de la bande : le défilement boucle sans saut visible
        let html = '';
        for (let copy = 0; copy < 3; copy++) {
          for (let i = 0; i < n; i++) html += `<div class="detente-cell">${detenteSymbolSvg(detenteState.strip[(i + r * 7) % n], 56)}</div>`;
        }
        stripEl.innerHTML = html;
      }
      const cell = stripEl.firstElementChild;
      // offsetHeight ignore les transformations (fondu d'ouverture en scale) : hauteur de mise en page réelle
      const h = cell ? cell.offsetHeight : 0;
      if (h > 0) detenteState.cellH = h;
      setDetenteReelPosition(r, detenteState.positions[r]);
    });
  }

  // Position = index (flottant) de la case affichée sur la ligne de gain
  function setDetenteReelPosition(r, pos) {
    const n = detenteState.strip.length;
    detenteState.positions[r] = pos;
    const reelEl = document.querySelector(`#detenteReels .detente-reel[data-reel="${r}"]`);
    const stripEl = reelEl && reelEl.querySelector('.detente-strip');
    if (!stripEl) return;
    const wrapped = ((pos % n) + n) % n;
    const topIndex = wrapped + n - 1; // copie du milieu, une case au-dessus visible
    stripEl.style.transform = `translate3d(0, ${(-topIndex * detenteState.cellH).toFixed(2)}px, 0)`;
  }

  function getDetenteReelSymbol(r) {
    const n = detenteState.strip.length;
    const idx = ((Math.round(detenteState.positions[r]) % n) + n) % n;
    return detenteState.strip[(idx + r * 7) % n];
  }

  function renderDetentePaytable() {
    const list = document.getElementById('detentePaytable');
    if (!list) return;
    const plumeIdx = DETENTE_SYMBOLS.length - 1;
    let html = '';
    for (let i = DETENTE_SYMBOLS.length - 1; i >= 0; i--) {
      const icons = detenteSymbolSvg(i, 22).repeat(3);
      html += `<li><span class="detente-pt-icons" title="${escapeHtml(DETENTE_SYMBOLS[i].label)} × 3">${icons}</span><span class="detente-pt-mult">×${DETENTE_SYMBOLS[i].mult}</span></li>`;
    }
    html += `<li><span class="detente-pt-icons" title="Deux plumes">${detenteSymbolSvg(plumeIdx, 22).repeat(2)}<span class="detente-pt-any">n’importe où</span></span><span class="detente-pt-mult">×${DETENTE_TWO_PLUMES_MULT}</span></li>`;
    html += `<li><span class="detente-pt-icons"><span class="detente-pt-any">Deux identiques côte à côte</span></span><span class="detente-pt-mult">×${DETENTE_PAIR_MULT}</span></li>`;
    list.innerHTML = html;
  }

  function renderDetenteHistory() {
    const list = document.getElementById('detenteHistory');
    if (!list) return;
    if (!detenteState.history.length) {
      list.innerHTML = '<li class="detente-history-empty">Aucun gain pour l’instant.</li>';
      return;
    }
    list.innerHTML = detenteState.history.map((h) => {
      const icons = h.symbols.map((s) => (DETENTE_SYMBOLS[s] ? detenteSymbolSvg(s, 18) : '')).join('');
      const t = new Date(h.at || Date.now());
      const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      return `<li><span class="detente-h-icons">${icons}</span><span class="detente-h-win">+${formatJetons(h.win)}</span><span class="detente-h-time">${time}</span></li>`;
    }).join('');
  }

  function renderDetenteHud() {
    const bal = document.getElementById('detenteBalance');
    if (bal && !bal.dataset.animating) bal.textContent = formatJetons(detenteState.balance);
    const betEl = document.getElementById('detenteBet');
    if (betEl) betEl.textContent = formatJetons(getDetenteBet());
    const canPlay = detenteState.balance >= getDetenteBet();
    const spinBtn = document.getElementById('btnDetenteSpin');
    if (spinBtn) spinBtn.disabled = detenteState.spinning || !canPlay;
    const lever = document.getElementById('detenteLever');
    if (lever) lever.classList.toggle('disabled', detenteState.spinning || !canPlay);
    const down = document.getElementById('btnDetenteBetDown');
    if (down) down.disabled = detenteState.spinning || detenteState.betIndex <= 0;
    const up = document.getElementById('btnDetenteBetUp');
    if (up) up.disabled = detenteState.spinning || detenteState.betIndex >= DETENTE_BETS.length - 1;
    const vol = document.getElementById('detenteVolume');
    if (vol && Number(vol.value) !== detenteState.volume) vol.value = String(detenteState.volume);
    const volVal = document.getElementById('detenteVolumeValue');
    if (volVal) volVal.textContent = `${detenteState.volume} %`;
    const muteBtn = document.getElementById('btnDetenteMute');
    if (muteBtn) {
      muteBtn.classList.toggle('muted', detenteState.muted);
      muteBtn.setAttribute('aria-pressed', detenteState.muted ? 'true' : 'false');
      const lbl = detenteState.muted ? 'Rétablir le son' : 'Couper le son';
      muteBtn.title = lbl;
      muteBtn.setAttribute('aria-label', lbl);
    }
    const page = document.getElementById('detentePage');
    if (page) page.classList.toggle('is-broke', detenteState.balance < 1);
  }

  function setDetenteMessage(id, text, tone = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  }

  function setDetenteResult(text, tone = '') {
    setDetenteMessage('detenteResult', text, tone);
  }

  const DETENTE_BROKE_HINT = 'Solde insuffisant : baisse la mise, saisis un code ou emprunte à la Banque.';

  // ---------- Carillon discret (WebAudio), jamais de son système ----------
  function getDetenteGain() {
    if (detenteState.muted || detenteState.volume <= 0) return 0;
    return detenteState.volume / 100;
  }

  function getDetenteAudioCtx() {
    if (getDetenteGain() <= 0) return null;
    if (!detenteState.audioCtx) {
      const Ctx = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!Ctx) return null;
      try { detenteState.audioCtx = new Ctx(); } catch (_) { return null; }
    }
    if (detenteState.audioCtx.state === 'suspended') detenteState.audioCtx.resume().catch(() => {});
    return detenteState.audioCtx;
  }

  function playDetenteTone(freq, startOffset, duration, peak) {
    const ctx = getDetenteAudioCtx();
    const vol = getDetenteGain();
    if (!ctx || vol <= 0) return;
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();
    const overGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(freq * 2.01, t0);
    overGain.gain.setValueAtTime(0.18, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    overtone.connect(overGain);
    overGain.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    overtone.start(t0);
    osc.stop(t0 + duration + 0.02);
    overtone.stop(t0 + duration + 0.02);
  }

  function playDetenteReelStop(r) {
    playDetenteTone([523.25, 587.33, 659.25][r] || 600, 0, 0.09, 0.07);
  }

  function playDetenteChime(big) {
    const notes = big ? [659.25, 783.99, 987.77, 1318.51] : [783.99, 1046.5];
    notes.forEach((f, i) => playDetenteTone(f, i * 0.11, big ? 0.9 : 0.6, 0.16));
  }

  function playDetenteTick() {
    playDetenteTone(880, 0, 0.05, 0.04);
  }

  // ---------- Lancer ----------
  // Position d'un rouleau à l'instant t (0..1) : décélération douce qui dépasse
  // d'un tiers de case, puis calage sur la case cible (vitesse continue)
  function detenteReelPos(from, to, t) {
    const overshoot = 0.32;
    if (t >= 1) return to;
    if (t < 0.88) {
      const u = t / 0.88;
      return from + (to + overshoot - from) * (1 - Math.pow(1 - u, 3));
    }
    const u = (t - 0.88) / 0.12;
    return to + overshoot * (1 + Math.cos(Math.PI * u)) / 2;
  }

  function isDetenteReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function spinDetente() {
    if (detenteState.spinning || !state.detentePageOpen) return false;
    const bet = getDetenteBet();
    if (detenteState.balance < bet) {
      setDetenteResult(DETENTE_BROKE_HINT, 'muted');
      return false;
    }
    detenteState.spinning = true;
    detenteAddBalance(-bet);
    clearDetenteWinMarks();
    setDetenteResult('…', '');
    renderDetenteHud();
    getDetenteAudioCtx(); // déverrouille l'audio dans le geste utilisateur (si son actif)

    const n = detenteState.strip.length;
    const reduced = isDetenteReducedMotion();
    const reels = [0, 1, 2].map((r) => {
      const stopIdx = detenteRandomInt(n);
      const from = detenteState.positions[r];
      const fromWrapped = ((Math.round(from) % n) + n) % n;
      const delta = (stopIdx - fromWrapped + n) % n;
      const loops = reduced ? 1 : 3 + r * 2;
      const to = Math.round(from) + loops * n + delta;
      const duration = reduced ? 380 + r * 120 : 1250 + r * 520;
      return { r, from, to, duration, done: false };
    });
    const reelEls = document.querySelectorAll('#detenteReels .detente-reel');
    reelEls.forEach((el) => el.classList.add('spinning'));
    const t0 = performance.now();

    const frame = (now) => {
      if (!state.detentePageOpen) {
        // Page fermée en plein lancer : on cale directement les rouleaux
        reels.forEach((rl) => { setDetenteReelPosition(rl.r, rl.to); rl.done = true; });
      }
      let allDone = true;
      reels.forEach((rl) => {
        if (rl.done) return;
        const t = Math.min(1, (now - t0) / rl.duration);
        setDetenteReelPosition(rl.r, detenteReelPos(rl.from, rl.to, t));
        if (t > 0.82 && reelEls[rl.r]) reelEls[rl.r].classList.remove('spinning');
        if (t >= 1) {
          rl.done = true;
          setDetenteReelPosition(rl.r, rl.to);
          if (reelEls[rl.r]) reelEls[rl.r].classList.remove('spinning');
          if (state.detentePageOpen) playDetenteReelStop(rl.r);
        } else {
          allDone = false;
        }
      });
      if (!allDone) {
        requestAnimationFrame(frame);
        return;
      }
      finishDetenteSpin(bet);
    };
    requestAnimationFrame(frame);
    return true;
  }

  function clearDetenteWinMarks() {
    document.querySelectorAll('#detenteReels .detente-reel').forEach((el) => el.classList.remove('win'));
    const machine = document.querySelector('#detentePage .detente-machine');
    if (machine) machine.classList.remove('won', 'won-big');
  }

  function finishDetenteSpin(bet) {
    detenteState.spinning = false;
    const symbols = [0, 1, 2].map(getDetenteReelSymbol);
    const result = evaluateDetenteLine(symbols);
    const win = bet * result.mult;
    if (win > 0) {
      const startBalance = detenteState.balance;
      detenteState.history.unshift({ symbols, win, at: Date.now() });
      detenteState.history = detenteState.history.slice(0, DETENTE_HISTORY_MAX);
      detenteAddBalance(win);
      const big = result.kind === 'triple' && result.mult >= 12;
      const reelEls = document.querySelectorAll('#detenteReels .detente-reel');
      result.cells.forEach((i) => reelEls[i] && reelEls[i].classList.add('win'));
      const machine = document.querySelector('#detentePage .detente-machine');
      if (machine) {
        void machine.offsetWidth;
        machine.classList.add(big ? 'won-big' : 'won');
      }
      const label = result.kind === 'triple'
        ? `${DETENTE_SYMBOLS[symbols[0]].label} × 3`
        : (result.kind === 'plumes' ? 'Deux plumes' : 'Paire');
      setDetenteResult(`${label} : +${formatJetons(win)} jetons`, 'win');
      animateDetenteBalance(startBalance, detenteState.balance);
      playDetenteChime(big);
      renderDetenteHistory();
    } else {
      setDetenteResult(detenteState.balance < DETENTE_BETS[0] ? 'Plus de jetons : saisis un code ou emprunte à la Banque.' : 'Pas cette fois.', 'muted');
    }
    saveDetenteState();
    renderDetenteHud();
  }

  function animateDetenteBalance(from, to) {
    const el = document.getElementById('detenteBalance');
    if (!el || to <= from) return;
    const t0 = performance.now();
    const dur = Math.min(900, 300 + (to - from) * 2);
    el.dataset.animating = '1';
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = formatJetons(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1 && state.detentePageOpen) requestAnimationFrame(step);
      else {
        delete el.dataset.animating;
        el.textContent = formatJetons(detenteState.balance);
      }
    };
    requestAnimationFrame(step);
  }

  function changeDetenteBet(dir) {
    if (detenteState.spinning) return;
    detenteState.betIndex = Math.max(0, Math.min(DETENTE_BETS.length - 1, detenteState.betIndex + dir));
    saveDetenteState();
    renderDetenteHud();
  }

  // ---------- Levier (souris, doigt, stylet) ----------
  function setDetenteLeverPull(ratio, animate) {
    const arm = document.getElementById('detenteLeverArm');
    if (!arm) return;
    arm.style.transition = animate ? 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none';
    arm.style.transform = `translateY(${(Math.max(0, Math.min(1, ratio)) * 96).toFixed(1)}px)`;
  }

  function pullDetenteLever() {
    if (detenteState.spinning) return;
    setDetenteLeverPull(1, true);
    setTimeout(() => setDetenteLeverPull(0, true), 220);
    spinDetente();
  }

  function bindDetenteLever() {
    const lever = document.getElementById('detenteLever');
    if (!lever) return;
    lever.addEventListener('pointerdown', (e) => {
      if (detenteState.spinning || e.button > 0) return;
      e.preventDefault();
      try { lever.setPointerCapture(e.pointerId); } catch (_) {}
      detenteState.leverDrag = { id: e.pointerId, y0: e.clientY, ratio: 0, moved: false };
    });
    lever.addEventListener('pointermove', (e) => {
      const d = detenteState.leverDrag;
      if (!d || d.id !== e.pointerId) return;
      d.ratio = Math.max(0, Math.min(1, (e.clientY - d.y0) / 96));
      if (d.ratio > 0.05) d.moved = true;
      setDetenteLeverPull(d.ratio, false);
    });
    const release = (e) => {
      const d = detenteState.leverDrag;
      if (!d || d.id !== e.pointerId) return;
      detenteState.leverDrag = null;
      setDetenteLeverPull(0, true);
      // Un appui simple ou une traction suffisante lance la partie
      if (e.type === 'pointerup' && (!d.moved || d.ratio >= 0.55)) spinDetente();
    };
    lever.addEventListener('pointerup', release);
    lever.addEventListener('pointercancel', release);
    lever.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pullDetenteLever(); }
    });
  }

  // ==================== BLACKJACK (6 jeux, croupier reste sur 17 souple, 3 pour 2) ====================
  // Règles : croupier vérifie le blackjack sous un As ou un 10 visible ; doubler sur deux cartes,
  // y compris après séparation ; une seule séparation ; As séparés : une carte chacun ; pas d'assurance.
  const BJ_DECKS = 6;
  const BJ_RESHUFFLE_AT = 78; // carton de coupe : rebat quand il reste un quart du sabot
  const BJ_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
  const BJ_RANK_NAMES = ['As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi'];
  const BJ_SUITS = [
    { id: 'pique', red: false, d: 'M12 3C9.2 7 4.5 9.6 4.5 13.4a3.9 3.9 0 0 0 6.6 2.8L10 20.5h4l-1.1-4.3a3.9 3.9 0 0 0 6.6-2.8C19.5 9.6 14.8 7 12 3Z' },
    { id: 'coeur', red: true, d: 'M12 20.2C6 16 3.6 12.6 3.6 9.4a4.3 4.3 0 0 1 8.4-1.3 4.3 4.3 0 0 1 8.4 1.3c0 3.2-2.4 6.6-8.4 10.8Z' },
    { id: 'carreau', red: true, d: 'M12 2.8 19 12l-7 9.2L5 12Z' },
    { id: 'trefle', red: false, d: 'M12 3.4a3.6 3.6 0 0 1 3.1 5.4 3.6 3.6 0 1 1-2 5.9l1 5.8h-4.2l1-5.8a3.6 3.6 0 1 1-2-5.9A3.6 3.6 0 0 1 12 3.4Z' }
  ];
  const bj = {
    shoe: [],
    phase: 'bet', // bet | player | dealer | done
    hands: [],
    active: 0,
    dealer: [],
    holeHidden: true,
    busy: false,
    timers: [],
    message: ''
  };

  function buildBlackjackShoe() {
    const shoe = [];
    for (let d = 0; d < BJ_DECKS; d++) {
      for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) shoe.push({ r, s });
    }
    for (let i = shoe.length - 1; i > 0; i--) {
      const j = detenteRandomInt(i + 1);
      const tmp = shoe[i]; shoe[i] = shoe[j]; shoe[j] = tmp;
    }
    bj.shoe = shoe;
  }

  function bjDraw() {
    if (!bj.shoe.length) buildBlackjackShoe();
    return bj.shoe.pop();
  }

  function bjCardValue(card) {
    return card.r === 0 ? 1 : Math.min(10, card.r + 1);
  }

  // { total, soft } : un As compte 11 si cela ne dépasse pas 21
  function bjHandTotal(cards) {
    let total = 0;
    let aces = 0;
    cards.forEach((c) => { total += bjCardValue(c); if (c.r === 0) aces++; });
    const soft = aces > 0 && total + 10 <= 21;
    return { total: soft ? total + 10 : total, soft };
  }

  function bjIsBlackjack(cards, fromSplit) {
    return !fromSplit && cards.length === 2 && bjHandTotal(cards).total === 21;
  }

  function bjCardSvg(card, hidden) {
    if (hidden) {
      return '<svg class="bj-card back" viewBox="0 0 64 90" aria-label="Carte cachée"><rect x="1.5" y="1.5" width="61" height="87" rx="8"/><rect class="card-inner" x="7" y="7" width="50" height="76" rx="5"/><path class="card-hatch" d="M7 19 19 7M7 31 31 7M7 43 43 7M7 55 55 7M7 67 57 17M7 79 57 29M15 83 57 41M27 83 57 53M39 83 57 65M51 83 57 77"/></svg>';
    }
    const suit = BJ_SUITS[card.s];
    const rank = BJ_RANKS[card.r];
    const face = card.r >= 10;
    const center = face
      ? `<rect class="card-face-frame" x="14" y="20" width="36" height="50" rx="4"/><text class="card-face-letter" x="32" y="52" text-anchor="middle">${rank}</text><g transform="translate(26 56) scale(0.5)"><path class="card-suit" d="${suit.d}"/></g>`
      : `<g transform="translate(17 30) scale(1.25)"><path class="card-suit" d="${suit.d}"/></g>`;
    return `<svg class="bj-card ${suit.red ? 'red' : 'black'}" viewBox="0 0 64 90" role="img" aria-label="${BJ_RANK_NAMES[card.r]} de ${suit.id}"><rect x="1.5" y="1.5" width="61" height="87" rx="8"/><text class="card-rank" x="7" y="17">${rank}</text><g transform="translate(5 20) scale(0.42)"><path class="card-suit" d="${suit.d}"/></g><g transform="rotate(180 32 45)"><text class="card-rank" x="7" y="17">${rank}</text><g transform="translate(5 20) scale(0.42)"><path class="card-suit" d="${suit.d}"/></g></g>${center}</svg>`;
  }

  function bjBet() {
    return DETENTE_BJ_BETS[detenteState.bjBetIndex];
  }

  function bjClearTimers() {
    bj.timers.forEach((t) => clearTimeout(t));
    bj.timers = [];
  }

  function bjLater(fn, ms) {
    const delay = isDetenteReducedMotion() ? Math.min(ms, 60) : ms;
    const t = setTimeout(() => {
      bj.timers = bj.timers.filter((x) => x !== t);
      fn();
    }, delay);
    bj.timers.push(t);
  }

  function bjTotalLabel(cards) {
    const { total, soft } = bjHandTotal(cards);
    return soft && total < 21 ? `${total - 10} / ${total}` : String(total);
  }

  function renderBlackjackTable() {
    const dealerEl = document.getElementById('bjDealerCards');
    const dealerTotal = document.getElementById('bjDealerTotal');
    const handsEl = document.getElementById('bjPlayerHands');
    if (!dealerEl || !handsEl) return;
    dealerEl.innerHTML = bj.dealer.map((c, i) => bjCardSvg(c, i === 1 && bj.holeHidden)).join('');
    if (dealerTotal) {
      if (!bj.dealer.length) dealerTotal.textContent = '';
      else if (bj.holeHidden) dealerTotal.textContent = String(bjHandTotal([bj.dealer[0]]).total);
      else dealerTotal.textContent = bjTotalLabel(bj.dealer);
    }
    if (!bj.hands.length) {
      handsEl.innerHTML = '<div class="bj-empty">Choisis ta mise puis distribue.</div>';
    } else {
      handsEl.innerHTML = bj.hands.map((h, i) => {
        const activeCls = bj.phase === 'player' && i === bj.active && bj.hands.length > 1 ? ' active' : '';
        const out = h.outcome ? ` outcome-${h.outcome}` : '';
        const tag = h.outcomeLabel ? `<span class="bj-hand-tag">${escapeHtml(h.outcomeLabel)}</span>` : '';
        return `<div class="bj-hand${activeCls}${out}"><div class="bj-cards">${h.cards.map((c) => bjCardSvg(c, false)).join('')}</div><div class="bj-hand-meta"><span class="bj-total">${bjTotalLabel(h.cards)}</span><span class="bj-hand-bet">Mise ${formatJetons(h.bet)}</span>${tag}</div></div>`;
      }).join('');
    }
    renderBlackjackControls();
  }

  function renderBlackjackControls() {
    const betEl = document.getElementById('bjBet');
    if (betEl) betEl.textContent = formatJetons(bjBet());
    const betting = bj.phase === 'bet' || bj.phase === 'done';
    const down = document.getElementById('btnBjBetDown');
    const up = document.getElementById('btnBjBetUp');
    if (down) down.disabled = !betting || bj.busy || detenteState.bjBetIndex <= 0;
    if (up) up.disabled = !betting || bj.busy || detenteState.bjBetIndex >= DETENTE_BJ_BETS.length - 1;
    const deal = document.getElementById('btnBjDeal');
    if (deal) {
      deal.classList.toggle('hidden', !betting);
      deal.disabled = bj.busy || detenteState.balance < bjBet();
    }
    const hand = bj.hands[bj.active];
    const playing = bj.phase === 'player' && !bj.busy && hand && !hand.done;
    const actions = document.getElementById('bjActions');
    if (actions) actions.classList.toggle('hidden', betting);
    const hit = document.getElementById('btnBjHit');
    const stand = document.getElementById('btnBjStand');
    const dbl = document.getElementById('btnBjDouble');
    const split = document.getElementById('btnBjSplit');
    if (hit) hit.disabled = !playing;
    if (stand) stand.disabled = !playing;
    if (dbl) dbl.disabled = !playing || hand.cards.length !== 2 || detenteState.balance < hand.bet;
    if (split) {
      split.disabled = !playing || bj.hands.length !== 1 || hand.cards.length !== 2
        || bjCardValue(hand.cards[0]) !== bjCardValue(hand.cards[1]) || detenteState.balance < hand.bet;
    }
    const shoeEl = document.getElementById('bjShoeCount');
    if (shoeEl) shoeEl.textContent = `${bj.shoe.length} cartes dans le sabot`;
  }

  function setBjMessage(text, tone) {
    setDetenteMessage('bjResult', text, tone);
  }

  function changeBjBet(dir) {
    if (bj.busy || !(bj.phase === 'bet' || bj.phase === 'done')) return;
    detenteState.bjBetIndex = Math.max(0, Math.min(DETENTE_BJ_BETS.length - 1, detenteState.bjBetIndex + dir));
    saveDetenteState();
    renderBlackjackControls();
  }

  function dealBlackjack() {
    if (bj.busy || !(bj.phase === 'bet' || bj.phase === 'done')) return;
    const bet = bjBet();
    if (detenteState.balance < bet) { setBjMessage(DETENTE_BROKE_HINT, 'muted'); return; }
    if (bj.shoe.length < BJ_RESHUFFLE_AT) buildBlackjackShoe();
    bjClearTimers();
    getDetenteAudioCtx();
    detenteAddBalance(-bet);
    bj.hands = [{ cards: [], bet, done: false, fromSplit: false, splitAces: false, outcome: '', outcomeLabel: '' }];
    bj.active = 0;
    bj.dealer = [];
    bj.holeHidden = true;
    bj.phase = 'player';
    bj.busy = true;
    setBjMessage('…', '');
    renderBlackjackTable();
    const order = [() => bj.hands[0].cards.push(bjDraw()), () => bj.dealer.push(bjDraw()), () => bj.hands[0].cards.push(bjDraw()), () => bj.dealer.push(bjDraw())];
    order.forEach((fn, i) => bjLater(() => { fn(); playDetenteTick(); renderBlackjackTable(); }, 260 * (i + 1)));
    bjLater(afterBlackjackDeal, 260 * 4 + 200);
  }

  function afterBlackjackDeal() {
    bj.busy = false;
    const hand = bj.hands[0];
    const playerBJ = bjIsBlackjack(hand.cards, false);
    const upVal = bjCardValue(bj.dealer[0]);
    const dealerBJ = bjIsBlackjack(bj.dealer, false);
    // Le croupier regarde sa carte cachée sous un As ou un 10 : blackjack révélé tout de suite
    if ((upVal === 1 || upVal === 10) && dealerBJ) {
      bj.holeHidden = false;
      hand.done = true;
      settleBlackjack(); // égalité si le joueur a aussi un blackjack
      return;
    }
    if (playerBJ) {
      hand.done = true;
      bj.holeHidden = false;
      settleBlackjack();
      return;
    }
    setBjMessage(`À toi : ${bjTotalLabel(hand.cards)}.`, '');
    renderBlackjackTable();
  }

  function bjCurrentHand() {
    return bj.phase === 'player' ? bj.hands[bj.active] : null;
  }

  function bjHit() {
    const hand = bjCurrentHand();
    if (!hand || hand.done || bj.busy) return;
    hand.cards.push(bjDraw());
    playDetenteTick();
    const { total } = bjHandTotal(hand.cards);
    if (total >= 21) hand.done = true;
    if (total > 21) { hand.outcome = 'lose'; hand.outcomeLabel = 'Dépasse 21'; }
    renderBlackjackTable();
    if (hand.done) bjNextHand();
  }

  function bjStand() {
    const hand = bjCurrentHand();
    if (!hand || hand.done || bj.busy) return;
    hand.done = true;
    bjNextHand();
  }

  function bjDouble() {
    const hand = bjCurrentHand();
    if (!hand || hand.done || bj.busy || hand.cards.length !== 2 || detenteState.balance < hand.bet) return;
    detenteAddBalance(-hand.bet);
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(bjDraw());
    playDetenteTick();
    hand.done = true;
    if (bjHandTotal(hand.cards).total > 21) { hand.outcome = 'lose'; hand.outcomeLabel = 'Dépasse 21'; }
    renderBlackjackTable();
    bjNextHand();
  }

  function bjSplit() {
    const hand = bjCurrentHand();
    if (!hand || bj.busy || bj.hands.length !== 1 || hand.cards.length !== 2) return;
    if (bjCardValue(hand.cards[0]) !== bjCardValue(hand.cards[1]) || detenteState.balance < hand.bet) return;
    detenteAddBalance(-hand.bet);
    const aces = hand.cards[0].r === 0;
    const second = { cards: [hand.cards.pop()], bet: hand.bet, done: false, fromSplit: true, splitAces: aces, outcome: '', outcomeLabel: '' };
    hand.fromSplit = true;
    hand.splitAces = aces;
    bj.hands.push(second);
    bj.busy = true;
    renderBlackjackTable();
    bjLater(() => { hand.cards.push(bjDraw()); playDetenteTick(); renderBlackjackTable(); }, 240);
    bjLater(() => {
      second.cards.push(bjDraw());
      playDetenteTick();
      bj.busy = false;
      bj.hands.forEach((h) => {
        // As séparés : une seule carte chacun ; 21 sur deux cartes s'arrête tout seul
        if (aces || bjHandTotal(h.cards).total >= 21) h.done = true;
      });
      renderBlackjackTable();
      if (bj.hands[bj.active].done) bjNextHand();
      else setBjMessage(`Main 1 : ${bjTotalLabel(hand.cards)}.`, '');
    }, 480);
  }

  function bjNextHand() {
    const next = bj.hands.findIndex((h) => !h.done);
    if (next >= 0) {
      bj.active = next;
      setBjMessage(`Main ${next + 1} : ${bjTotalLabel(bj.hands[next].cards)}.`, '');
      renderBlackjackTable();
      return;
    }
    bjDealerPlay();
  }

  function bjDealerPlay() {
    bj.phase = 'dealer';
    bj.busy = true;
    bj.holeHidden = false;
    renderBlackjackTable();
    const allBust = bj.hands.every((h) => bjHandTotal(h.cards).total > 21);
    const step = () => {
      // Le croupier tire jusqu'à 17 et reste sur tous les 17, souples compris
      if (!allBust && bjHandTotal(bj.dealer).total < 17) {
        bj.dealer.push(bjDraw());
        playDetenteTick();
        renderBlackjackTable();
        bjLater(step, 520);
        return;
      }
      bj.busy = false;
      settleBlackjack();
    };
    bjLater(step, 480);
  }

  function settleBlackjack() {
    bj.phase = 'done';
    bj.busy = false;
    bj.holeHidden = false;
    const dealer = bjHandTotal(bj.dealer).total;
    const dealerBJ = bjIsBlackjack(bj.dealer, false);
    let returned = 0;
    let staked = 0;
    bj.hands.forEach((h) => {
      staked += h.bet;
      const total = bjHandTotal(h.cards).total;
      const playerBJ = bjIsBlackjack(h.cards, h.fromSplit);
      if (total > 21) { h.outcome = 'lose'; h.outcomeLabel = 'Dépasse 21'; return; }
      if (playerBJ && !dealerBJ) { h.outcome = 'win'; h.outcomeLabel = 'Blackjack 3 pour 2'; returned += h.bet + (h.bet * 3) / 2; return; }
      if (dealerBJ && !playerBJ) { h.outcome = 'lose'; h.outcomeLabel = 'Blackjack du croupier'; return; }
      if (playerBJ && dealerBJ) { h.outcome = 'push'; h.outcomeLabel = 'Égalité'; returned += h.bet; return; }
      if (dealer > 21 || total > dealer) { h.outcome = 'win'; h.outcomeLabel = dealer > 21 ? 'Croupier dépasse' : 'Gagné'; returned += h.bet * 2; return; }
      if (total === dealer) { h.outcome = 'push'; h.outcomeLabel = 'Égalité'; returned += h.bet; return; }
      h.outcome = 'lose'; h.outcomeLabel = 'Perdu';
    });
    returned = Math.floor(returned);
    if (returned > 0) {
      const start = detenteState.balance;
      detenteAddBalance(returned);
      animateDetenteBalance(start, detenteState.balance);
    }
    const net = returned - staked;
    if (net > 0) {
      setBjMessage(`Gagné : +${formatJetons(net)} jetons.`, 'win');
      playDetenteChime(net >= staked * 1.5);
    } else if (net === 0) {
      setBjMessage('Égalité : mise rendue.', '');
    } else {
      setBjMessage(detenteState.balance < DETENTE_BJ_BETS[0] ? 'Plus de jetons : saisis un code ou emprunte à la Banque.' : `Perdu : −${formatJetons(-net)} jetons.`, 'muted');
    }
    renderBlackjackTable();
  }

  // ==================== ROULETTE EUROPÉENNE (un seul zéro) ====================
  const RL_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RL_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  // Tapis (coordonnées SVG) : zéro à gauche, 12 colonnes × 3 rangées, colonnes 2:1 à droite
  const RL_GEO = { x0: 44, cw: 46, ch: 46, zw: 44, colW: 48, rowH: 40, pad: 2 };
  RL_GEO.gridW = RL_GEO.cw * 12;
  RL_GEO.gridH = RL_GEO.ch * 3;
  RL_GEO.width = RL_GEO.x0 + RL_GEO.gridW + RL_GEO.colW + RL_GEO.pad;
  RL_GEO.height = RL_GEO.gridH + RL_GEO.rowH * 2 + RL_GEO.pad * 2;
  const rl = {
    bets: new Map(), // clé -> { numbers, amount, label, x, y }
    order: [], // clés dans l'ordre de pose (pour Annuler)
    lastBets: null,
    spinning: false,
    wheelAngle: 0,
    ballAngle: 0,
    ballRadius: 96,
    result: null
  };

  function rlColor(n) {
    if (n === 0) return 'green';
    return RL_RED.has(n) ? 'red' : 'black';
  }

  // Numéro dans la case (colonne c de 0 à 11, rangée r de 0 en haut à 2 en bas)
  function rlNumberAt(c, r) {
    return 3 * c + 3 - r;
  }

  function rlPayout(count) {
    return 36 / count - 1;
  }

  function rlBetFromNumbers(numbers, label, x, y) {
    const sorted = numbers.slice().sort((a, b) => a - b);
    return { key: `n:${sorted.join('-')}`, numbers: sorted, label, x, y };
  }

  const RL_KIND_LABEL = { 1: 'Plein', 2: 'Cheval', 3: 'Transversale', 4: 'Carré', 6: 'Sixain' };

  // Repère la mise visée par un point du tapis (tolérance de bord : 24 % de la case)
  function rlHitTest(x, y) {
    const g = RL_GEO;
    const tol = 0.24;
    const gy = y - g.pad;
    if (gy < 0 || x < 0 || x > g.width) return null;
    if (gy <= g.gridH) {
      // Le bord du zéro se vise des deux côtés de la ligne (cheval, transversale ou carré avec le 0)
      if (x < g.x0 - g.cw * tol * 0.6) return rlBetFromNumbers([0], 'Plein 0', g.zw / 2 + 1, g.pad + g.gridH / 2);
      const gx = Math.max(0, x - g.x0);
      if (gx > g.gridW) {
        const r = Math.min(2, Math.floor(gy / g.ch));
        const nums = [];
        for (let n = 1; n <= 36; n++) if ((n - 1) % 3 === 2 - r) nums.push(n);
        return { key: `col:${r}`, numbers: nums, label: `Colonne ${3 - r}`, x: g.x0 + g.gridW + g.colW / 2, y: g.pad + r * g.ch + g.ch / 2 };
      }
      const fx = gx / g.cw;
      const fy = gy / g.ch;
      let c = Math.min(11, Math.floor(fx));
      let r = Math.min(2, Math.floor(fy));
      const dx = fx - c;
      const dy = fy - r;
      let vEdge = 0; // -1 bord gauche, +1 bord droit
      let hEdge = 0; // -1 bord haut, +1 bord bas
      if (dx < tol) vEdge = -1; else if (dx > 1 - tol) vEdge = 1;
      if (dy < tol) hEdge = -1; else if (dy > 1 - tol) hEdge = 1;
      // Ramène les bords droit/bas vers la case voisine pour un traitement unique
      if (vEdge === 1 && c < 11) { c += 1; vEdge = -1; }
      if (hEdge === -1 && r > 0) { r -= 1; hEdge = 1; }
      const px = g.x0 + c * g.cw;
      const py = g.pad + r * g.ch;
      const bottomRow = r === 2;
      if (vEdge === 0 && hEdge === 0) {
        const n = rlNumberAt(c, r);
        return rlBetFromNumbers([n], `Plein ${n}`, px + g.cw / 2, py + g.ch / 2);
      }
      if (vEdge === 1) vEdge = 0; // bord droit de la dernière colonne : pas de mise
      if (hEdge === -1) hEdge = 0; // bord haut du tapis : traité comme un plein
      if (vEdge === 0 && hEdge === 0) {
        const n = rlNumberAt(c, r);
        return rlBetFromNumbers([n], `Plein ${n}`, px + g.cw / 2, py + g.ch / 2);
      }
      if (vEdge === -1 && hEdge === 0) {
        const n = rlNumberAt(c, r);
        const other = c === 0 ? 0 : rlNumberAt(c - 1, r);
        return rlBetFromNumbers([other, n], `Cheval ${Math.min(other, n)}-${Math.max(other, n)}`, px, py + g.ch / 2);
      }
      if (vEdge === 0 && hEdge === 1) {
        if (bottomRow) {
          const base = 3 * c + 1;
          return rlBetFromNumbers([base, base + 1, base + 2], `Transversale ${base}-${base + 2}`, px + g.cw / 2, py + g.ch);
        }
        const a = rlNumberAt(c, r);
        const b = rlNumberAt(c, r + 1);
        return rlBetFromNumbers([a, b], `Cheval ${b}-${a}`, px + g.cw / 2, py + g.ch);
      }
      // Coin (bord gauche + bord bas)
      if (bottomRow) {
        if (c === 0) return rlBetFromNumbers([0, 1, 2, 3], 'Carré 0-1-2-3', px, py + g.ch);
        const base = 3 * (c - 1) + 1;
        return rlBetFromNumbers([base, base + 1, base + 2, base + 3, base + 4, base + 5], `Sixain ${base}-${base + 5}`, px, py + g.ch);
      }
      if (c === 0) {
        const nums = [0, rlNumberAt(0, r), rlNumberAt(0, r + 1)];
        return rlBetFromNumbers(nums, `Transversale ${nums.slice().sort((a, b) => a - b).join('-')}`, px, py + g.ch);
      }
      const nums = [rlNumberAt(c - 1, r), rlNumberAt(c, r), rlNumberAt(c - 1, r + 1), rlNumberAt(c, r + 1)];
      const s = nums.slice().sort((a, b) => a - b);
      return rlBetFromNumbers(nums, `Carré ${s[0]}-${s[3]}`, px, py + g.ch);
    }
    const gx = x - g.x0;
    if (gx < 0 || gx > g.gridW) return null;
    if (gy <= g.gridH + g.rowH) {
      const d = Math.min(2, Math.floor(gx / (g.cw * 4)));
      const nums = [];
      for (let n = d * 12 + 1; n <= d * 12 + 12; n++) nums.push(n);
      return { key: `dz:${d}`, numbers: nums, label: `${['1re', '2e', '3e'][d]} douzaine`, x: g.x0 + d * g.cw * 4 + g.cw * 2, y: g.pad + g.gridH + g.rowH / 2 };
    }
    if (gy <= g.gridH + g.rowH * 2) {
      const i = Math.min(5, Math.floor(gx / (g.cw * 2)));
      const defs = [
        ['low', 'Manque 1-18', (n) => n >= 1 && n <= 18],
        ['even', 'Pair', (n) => n > 0 && n % 2 === 0],
        ['red', 'Rouge', (n) => RL_RED.has(n)],
        ['black', 'Noir', (n) => n > 0 && !RL_RED.has(n)],
        ['odd', 'Impair', (n) => n % 2 === 1],
        ['high', 'Passe 19-36', (n) => n >= 19]
      ];
      const [key, label, pred] = defs[i];
      const nums = [];
      for (let n = 1; n <= 36; n++) if (pred(n)) nums.push(n);
      return { key, numbers: nums, label, x: g.x0 + i * g.cw * 2 + g.cw, y: g.pad + g.gridH + g.rowH * 1.5 };
    }
    return null;
  }

  function rlTotalStake() {
    let t = 0;
    rl.bets.forEach((b) => { t += b.amount; });
    return t;
  }

  function rlChip() {
    return DETENTE_ROULETTE_CHIPS[detenteState.chipIndex];
  }

  function buildRouletteTable() {
    const svg = document.getElementById('rlTable');
    if (!svg) return;
    const g = RL_GEO;
    svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    let html = `<rect class="rl-felt" x="0" y="0" width="${g.width}" height="${g.height}" rx="10"/>`;
    // Zéro
    html += `<path class="rl-cell rl-green" data-n="0" d="M${g.x0} ${g.pad} H${g.zw * 0.45 + 2} L2 ${g.pad + g.gridH / 2} L${g.zw * 0.45 + 2} ${g.pad + g.gridH} H${g.x0} Z"/>`;
    html += `<text class="rl-num" x="${g.zw / 2 + 4}" y="${g.pad + g.gridH / 2 + 5}" text-anchor="middle">0</text>`;
    for (let c = 0; c < 12; c++) {
      for (let r = 0; r < 3; r++) {
        const n = rlNumberAt(c, r);
        const x = g.x0 + c * g.cw;
        const y = g.pad + r * g.ch;
        html += `<rect class="rl-cell rl-${rlColor(n)}" data-n="${n}" x="${x}" y="${y}" width="${g.cw}" height="${g.ch}"/>`;
        html += `<text class="rl-num" x="${x + g.cw / 2}" y="${y + g.ch / 2 + 5}" text-anchor="middle">${n}</text>`;
      }
    }
    for (let r = 0; r < 3; r++) {
      const x = g.x0 + g.gridW;
      const y = g.pad + r * g.ch;
      html += `<rect class="rl-cell rl-outside" data-col="${r}" x="${x}" y="${y}" width="${g.colW}" height="${g.ch}"/><text class="rl-label" x="${x + g.colW / 2}" y="${y + g.ch / 2 + 4}" text-anchor="middle">2:1</text>`;
    }
    const dzY = g.pad + g.gridH;
    ['1re 12', '2e 12', '3e 12'].forEach((lbl, d) => {
      const x = g.x0 + d * g.cw * 4;
      html += `<rect class="rl-cell rl-outside" data-dz="${d}" x="${x}" y="${dzY}" width="${g.cw * 4}" height="${g.rowH}"/><text class="rl-label" x="${x + g.cw * 2}" y="${dzY + g.rowH / 2 + 4}" text-anchor="middle">${lbl}</text>`;
    });
    const evY = dzY + g.rowH;
    ['1-18', 'Pair', '', '', 'Impair', '19-36'].forEach((lbl, i) => {
      const x = g.x0 + i * g.cw * 2;
      html += `<rect class="rl-cell rl-outside" data-ev="${i}" x="${x}" y="${evY}" width="${g.cw * 2}" height="${g.rowH}"/>`;
      if (i === 2 || i === 3) {
        const cx = x + g.cw; const cy = evY + g.rowH / 2;
        html += `<path class="rl-diamond rl-${i === 2 ? 'red' : 'black'}" d="M${cx} ${cy - 12} L${cx + 20} ${cy} L${cx} ${cy + 12} L${cx - 20} ${cy} Z"/>`;
      } else {
        html += `<text class="rl-label" x="${x + g.cw}" y="${evY + g.rowH / 2 + 4}" text-anchor="middle">${lbl}</text>`;
      }
    });
    html += '<g id="rlHover" class="rl-hover"></g><g id="rlChips"></g>';
    svg.innerHTML = html;
  }

  function rlSvgPoint(svg, clientX, clientY) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function renderRouletteChips() {
    const g = document.getElementById('rlChips');
    if (!g) return;
    let html = '';
    rl.bets.forEach((b) => {
      const win = rl.result !== null && b.numbers.includes(rl.result);
      html += `<g class="rl-chip${win ? ' win' : ''}" transform="translate(${b.x} ${b.y})"><circle r="13"/><circle class="rl-chip-ring" r="9.5"/><text y="4" text-anchor="middle">${formatChipLabel(b.amount)}</text></g>`;
    });
    g.innerHTML = html;
    document.querySelectorAll('#rlTable .rl-cell[data-n]').forEach((el) => {
      el.classList.toggle('rl-winning', rl.result !== null && Number(el.dataset.n) === rl.result);
    });
  }

  function renderRouletteHover(bet) {
    const layer = document.getElementById('rlHover');
    if (!layer) return;
    document.querySelectorAll('#rlTable .rl-cell[data-n]').forEach((el) => {
      el.classList.toggle('rl-hl', Boolean(bet) && bet.numbers.includes(Number(el.dataset.n)));
    });
    layer.innerHTML = bet ? `<circle cx="${bet.x}" cy="${bet.y}" r="6"/>` : '';
    const hint = document.getElementById('rlHint');
    if (hint) hint.textContent = bet ? `${bet.label} · paie ${rlPayout(bet.numbers.length)} pour 1` : 'Touche le tapis pour miser : case, bord ou coin.';
  }

  function renderRouletteControls() {
    const stake = rlTotalStake();
    const stakeEl = document.getElementById('rlStake');
    if (stakeEl) stakeEl.textContent = formatJetons(stake);
    document.querySelectorAll('#rlChipRack [data-chip]').forEach((b) => {
      const v = Number(b.dataset.chip);
      b.classList.toggle('active', DETENTE_ROULETTE_CHIPS[detenteState.chipIndex] === v);
      b.disabled = rl.spinning;
    });
    const spin = document.getElementById('btnRlSpin');
    if (spin) spin.disabled = rl.spinning || stake <= 0 || stake > detenteState.balance;
    const undo = document.getElementById('btnRlUndo');
    if (undo) undo.disabled = rl.spinning || !rl.order.length;
    const clear = document.getElementById('btnRlClear');
    if (clear) clear.disabled = rl.spinning || !rl.bets.size;
    const rebet = document.getElementById('btnRlRebet');
    if (rebet) {
      let lastTotal = 0;
      if (rl.lastBets) rl.lastBets.forEach((b) => { lastTotal += b.amount; });
      rebet.disabled = rl.spinning || !rl.lastBets || (rl.bets.size > 0 && rl.result === null) || lastTotal > detenteState.balance;
    }
    const hist = document.getElementById('rlHistory');
    if (hist) {
      hist.innerHTML = detenteState.rouletteHistory.length
        ? detenteState.rouletteHistory.map((n) => `<span class="rl-pill rl-${rlColor(n)}">${n}</span>`).join('')
        : '<span class="detente-history-empty">Aucun tirage.</span>';
    }
  }

  function placeRouletteBet(bet) {
    if (rl.spinning || !bet) return;
    if (rl.result !== null) { rl.result = null; rl.bets.clear(); rl.order = []; }
    const chip = rlChip();
    if (rlTotalStake() + chip > detenteState.balance) {
      setDetenteMessage('rlResult', DETENTE_BROKE_HINT, 'muted');
      return;
    }
    const cur = rl.bets.get(bet.key);
    if (cur) cur.amount += chip;
    else rl.bets.set(bet.key, { numbers: bet.numbers, amount: chip, label: bet.label, x: bet.x, y: bet.y });
    rl.order.push({ key: bet.key, amount: chip });
    playDetenteTick();
    setDetenteMessage('rlResult', `${bet.label} : ${formatJetons(rl.bets.get(bet.key).amount)} jetons.`, '');
    renderRouletteChips();
    renderRouletteControls();
  }

  function undoRouletteBet() {
    if (rl.spinning || !rl.order.length) return;
    const last = rl.order.pop();
    const b = rl.bets.get(last.key);
    if (b) {
      b.amount -= last.amount;
      if (b.amount <= 0) rl.bets.delete(last.key);
    }
    renderRouletteChips();
    renderRouletteControls();
  }

  function clearRouletteBets() {
    if (rl.spinning) return;
    rl.bets.clear();
    rl.order = [];
    rl.result = null;
    renderRouletteChips();
    renderRouletteControls();
  }

  function rebetRoulette() {
    if (rl.spinning || !rl.lastBets) return;
    rl.result = null;
    rl.bets.clear();
    rl.order = [];
    rl.lastBets.forEach((b, key) => {
      rl.bets.set(key, { ...b });
      rl.order.push({ key, amount: b.amount });
    });
    if (rlTotalStake() > detenteState.balance) { clearRouletteBets(); return; }
    renderRouletteChips();
    renderRouletteControls();
  }

  function buildRouletteWheel() {
    const svg = document.getElementById('rlWheel');
    if (!svg) return;
    const n = RL_WHEEL.length;
    const step = 360 / n;
    const rOut = 92;
    const rIn = 64;
    const toXY = (deg, r) => {
      const a = (deg - 90) * Math.PI / 180;
      return [(Math.cos(a) * r).toFixed(2), (Math.sin(a) * r).toFixed(2)];
    };
    let pockets = '';
    RL_WHEEL.forEach((num, i) => {
      const a0 = i * step - step / 2;
      const a1 = i * step + step / 2;
      const [x0, y0] = toXY(a0, rOut);
      const [x1, y1] = toXY(a1, rOut);
      const [x2, y2] = toXY(a1, rIn);
      const [x3, y3] = toXY(a0, rIn);
      pockets += `<path class="rl-pocket rl-${rlColor(num)}" d="M${x0} ${y0} A${rOut} ${rOut} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${rIn} ${rIn} 0 0 0 ${x3} ${y3} Z"/>`;
      const [tx, ty] = toXY(i * step, (rOut + rIn) / 2 + 5);
      pockets += `<text class="rl-pocket-num" x="${tx}" y="${ty}" transform="rotate(${(i * step).toFixed(2)} ${tx} ${ty})" text-anchor="middle" dominant-baseline="middle">${num}</text>`;
    });
    let spokes = '';
    for (let k = 0; k < 8; k++) {
      const [sx, sy] = toXY(k * 45, rIn - 6);
      spokes += `<line x1="0" y1="0" x2="${sx}" y2="${sy}"/>`;
    }
    svg.innerHTML = `<circle class="rl-rim" r="108"/><circle class="rl-track" r="100"/><g id="rlWheelRotor">${pockets}<circle class="rl-hub-ring" r="${rIn - 4}"/><g class="rl-spokes">${spokes}</g><circle class="rl-hub" r="14"/></g><path class="rl-marker" d="M0 -100 L-6 -110 H6 Z"/><circle id="rlBall" class="rl-ball" r="5" cx="0" cy="-96"/>`;
    setRouletteWheel(rl.wheelAngle, rl.ballAngle, rl.ballRadius);
  }

  function setRouletteWheel(wheelAngle, ballAngle, ballRadius) {
    const rotor = document.getElementById('rlWheelRotor');
    if (rotor) rotor.setAttribute('transform', `rotate(${(wheelAngle % 360).toFixed(2)})`);
    const ball = document.getElementById('rlBall');
    if (ball) {
      const a = (ballAngle - 90) * Math.PI / 180;
      ball.setAttribute('cx', (Math.cos(a) * ballRadius).toFixed(2));
      ball.setAttribute('cy', (Math.sin(a) * ballRadius).toFixed(2));
    }
  }

  function spinRoulette() {
    if (rl.spinning) return;
    const stake = rlTotalStake();
    if (stake <= 0) { setDetenteMessage('rlResult', 'Pose au moins une mise sur le tapis.', 'muted'); return; }
    if (stake > detenteState.balance) { setDetenteMessage('rlResult', DETENTE_BROKE_HINT, 'muted'); return; }
    getDetenteAudioCtx();
    detenteAddBalance(-stake);
    rl.spinning = true;
    rl.result = null;
    renderRouletteChips();
    renderRouletteControls();
    setDetenteMessage('rlResult', 'Les jeux sont faits, rien ne va plus.', '');
    const winIdx = detenteRandomInt(RL_WHEEL.length);
    const step = 360 / RL_WHEEL.length;
    const reduced = isDetenteReducedMotion();
    const w0 = rl.wheelAngle;
    // La case gagnante finit sous le repère (en haut) : angle du rotor ≡ −index × pas
    const targetMod = ((-winIdx * step) % 360 + 360) % 360;
    const w0Mod = ((w0 % 360) + 360) % 360;
    const w1 = w0 + (reduced ? 360 : 720) + ((targetMod - w0Mod + 360) % 360);
    const b0 = rl.ballAngle;
    const b0Mod = ((b0 % 360) + 360) % 360;
    const b1 = b0 - (reduced ? 360 : 1440) - b0Mod; // la bille tourne en sens inverse et finit en haut
    const duration = reduced ? 700 : 4600;
    const t0 = performance.now();
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const frame = (now) => {
      const t = state.detentePageOpen ? Math.min(1, (now - t0) / duration) : 1;
      const wa = w0 + (w1 - w0) * easeOut(t);
      const ba = b0 + (b1 - b0) * (1 - Math.pow(1 - t, 2.2));
      // La bille quitte la piste et tombe dans la case sur la fin du lancer
      const drop = t < 0.72 ? 0 : Math.min(1, (t - 0.72) / 0.2);
      const bounce = t > 0.72 && t < 0.95 ? Math.sin((t - 0.72) / 0.23 * Math.PI * 3) * 3 * (1 - drop) : 0;
      const br = 96 - drop * 16 + bounce;
      setRouletteWheel(wa, ba, br);
      if (t < 1) { requestAnimationFrame(frame); return; }
      rl.wheelAngle = w1 % 360;
      rl.ballAngle = 0;
      rl.ballRadius = 80;
      finishRouletteSpin(RL_WHEEL[winIdx]);
    };
    requestAnimationFrame(frame);
  }

  function finishRouletteSpin(number) {
    rl.spinning = false;
    rl.result = number;
    detenteState.rouletteHistory.unshift(number);
    detenteState.rouletteHistory = detenteState.rouletteHistory.slice(0, 12);
    let returned = 0;
    let staked = 0;
    rl.bets.forEach((b) => {
      staked += b.amount;
      if (b.numbers.includes(number)) returned += b.amount * (rlPayout(b.numbers.length) + 1);
    });
    rl.lastBets = new Map();
    rl.bets.forEach((b, key) => rl.lastBets.set(key, { ...b }));
    const colorName = number === 0 ? 'vert' : (RL_RED.has(number) ? 'rouge' : 'noir');
    if (returned > 0) {
      const start = detenteState.balance;
      detenteAddBalance(returned);
      animateDetenteBalance(start, detenteState.balance);
      const net = returned - staked;
      setDetenteMessage('rlResult', `${number} ${colorName} : ${net >= 0 ? '+' : '−'}${formatJetons(Math.abs(net))} jetons (retour ${formatJetons(returned)}).`, net > 0 ? 'win' : '');
      playDetenteChime(returned >= staked * 10);
    } else {
      setDetenteMessage('rlResult', `${number} ${colorName} : perdu.`, 'muted');
    }
    saveDetenteState();
    renderRouletteChips();
    renderRouletteControls();
  }

  function bindRouletteTable() {
    const svg = document.getElementById('rlTable');
    if (!svg) return;
    svg.addEventListener('click', (e) => {
      const p = rlSvgPoint(svg, e.clientX, e.clientY);
      if (!p) return;
      placeRouletteBet(rlHitTest(p.x, p.y));
    });
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const p = rlSvgPoint(svg, e.clientX, e.clientY);
      renderRouletteHover(p ? rlHitTest(p.x, p.y) : null);
    });
    svg.addEventListener('pointerleave', () => renderRouletteHover(null));
    const rack = document.getElementById('rlChipRack');
    if (rack) {
      rack.innerHTML = DETENTE_ROULETTE_CHIPS.map((v) => `<button type="button" class="rl-chip-btn" data-chip="${v}" aria-label="Jeton de ${v}">${formatChipLabel(v)}</button>`).join('');
      rack.addEventListener('click', (e) => {
        const b = e.target.closest('[data-chip]');
        if (!b || rl.spinning) return;
        detenteState.chipIndex = Math.max(0, DETENTE_ROULETTE_CHIPS.indexOf(Number(b.dataset.chip)));
        saveDetenteState();
        renderRouletteControls();
      });
    }
  }

  // ==================== ONGLETS, PROBABILITÉS, INITIALISATION ====================
  function setDetenteTab(tab) {
    if (!DETENTE_TABS.includes(tab)) return;
    detenteState.tab = tab;
    saveDetenteState();
    document.querySelectorAll('#detenteTabs [data-detente-tab]').forEach((b) => {
      const on = b.dataset.detenteTab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('#detentePage [data-detente-panel]').forEach((p) => {
      p.classList.toggle('hidden', p.dataset.detentePanel !== tab);
    });
    renderDetenteActivePanel();
  }

  function renderDetenteActivePanel() {
    const tab = detenteState.tab;
    if (tab === 'slot') {
      renderDetentePaytable();
      renderDetenteHistory();
      renderDetenteReels();
    } else if (tab === 'blackjack') {
      if (!bj.shoe.length) buildBlackjackShoe();
      renderBlackjackTable();
    } else if (tab === 'roulette') {
      renderRouletteChips();
      renderRouletteControls();
    } else if (tab === 'shop') {
      renderDetenteShop();
    } else if (tab === 'bank') {
      renderDetenteBank();
    }
    renderDetenteHud();
    refreshDetenteWalletUi();
  }

  function renderDetenteOdds() {
    const el = document.getElementById('detenteOddsCosts');
    if (el) {
      el.innerHTML = `<li><span>Créer un cahier</span><strong>${DETENTE_COSTS.notebook} jetons</strong></li>`
        + `<li><span>Ajouter ou dupliquer une page</span><strong>${DETENTE_COSTS.page} jeton</strong></li>`
        + `<li><span>Importer un PDF</span><strong>${DETENTE_COSTS.pdf} jetons</strong></li>`
        + '<li><span>Ouvrir, lire, modifier, exporter, supprimer</span><strong>Gratuit</strong></li>';
    }
  }

  function initDetentePage() {
    if (detenteState.eventsBound) return;
    const pageEl = document.getElementById('detentePage');
    loadDetenteState();
    applyDetenteUnlocks();
    refreshDetenteWalletUi();
    bindDetenteFundsModal();
    if (!pageEl) return;
    detenteState.eventsBound = true;
    detenteState.strip = buildDetenteStrip();
    detenteState.positions = [detenteRandomInt(detenteState.strip.length), detenteRandomInt(detenteState.strip.length), detenteRandomInt(detenteState.strip.length)];

    document.getElementById('btnOpenDetente')?.addEventListener('click', () => toggleDetentePage());
    document.getElementById('btnCloseDetentePage')?.addEventListener('click', closeDetentePage);
    document.getElementById('btnDetenteSpin')?.addEventListener('click', () => pullDetenteLever());
    document.getElementById('btnDetenteBetDown')?.addEventListener('click', () => changeDetenteBet(-1));
    document.getElementById('btnDetenteBetUp')?.addEventListener('click', () => changeDetenteBet(1));
    document.getElementById('btnDetenteMute')?.addEventListener('click', () => {
      detenteState.muted = !detenteState.muted;
      saveDetenteState();
      renderDetenteHud();
    });
    const vol = document.getElementById('detenteVolume');
    if (vol) {
      vol.addEventListener('input', () => {
        detenteState.volume = Math.max(0, Math.min(100, Math.round(Number(vol.value) || 0)));
        if (detenteState.volume > 0 && detenteState.muted) detenteState.muted = false;
        renderDetenteHud();
      });
      vol.addEventListener('change', () => {
        saveDetenteState();
        playDetenteTone(783.99, 0, 0.35, 0.14); // aperçu du carillon au volume choisi
      });
    }
    bindDetenteLever();

    // Onglets (clic, flèches gauche/droite)
    const tabs = document.getElementById('detenteTabs');
    if (tabs) {
      tabs.addEventListener('click', (e) => {
        const b = e.target.closest('[data-detente-tab]');
        if (b) setDetenteTab(b.dataset.detenteTab);
      });
      tabs.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = DETENTE_TABS.indexOf(detenteState.tab);
        const next = DETENTE_TABS[(i + (e.key === 'ArrowRight' ? 1 : DETENTE_TABS.length - 1)) % DETENTE_TABS.length];
        setDetenteTab(next);
        tabs.querySelector(`[data-detente-tab="${next}"]`)?.focus();
      });
    }

    // Blackjack
    document.getElementById('btnBjBetDown')?.addEventListener('click', () => changeBjBet(-1));
    document.getElementById('btnBjBetUp')?.addEventListener('click', () => changeBjBet(1));
    document.getElementById('btnBjDeal')?.addEventListener('click', dealBlackjack);
    document.getElementById('btnBjHit')?.addEventListener('click', bjHit);
    document.getElementById('btnBjStand')?.addEventListener('click', bjStand);
    document.getElementById('btnBjDouble')?.addEventListener('click', bjDouble);
    document.getElementById('btnBjSplit')?.addEventListener('click', bjSplit);

    // Roulette
    buildRouletteTable();
    buildRouletteWheel();
    bindRouletteTable();
    document.getElementById('btnRlSpin')?.addEventListener('click', spinRoulette);
    document.getElementById('btnRlUndo')?.addEventListener('click', undoRouletteBet);
    document.getElementById('btnRlClear')?.addEventListener('click', clearRouletteBets);
    document.getElementById('btnRlRebet')?.addEventListener('click', rebetRoulette);

    // Boutique
    document.getElementById('detenteShopGroups')?.addEventListener('click', (e) => {
      const buy = e.target.closest('[data-detente-buy]');
      if (buy) { buyDetenteItem(buy.dataset.detenteBuy); return; }
      const th = e.target.closest('[data-detente-theme]');
      if (th) setDetenteTheme(th.dataset.detenteTheme);
    });

    // Banque
    document.getElementById('btnDetenteCode')?.addEventListener('click', () => submitDetenteCode('detenteCodeInput', 'detenteCodeMsg'));
    document.getElementById('detenteCodeInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitDetenteCode('detenteCodeInput', 'detenteCodeMsg'); }
    });
    document.getElementById('btnDetenteCopyAccount')?.addEventListener('click', copyDetenteAccountCode);
    document.getElementById('btnDetenteRepay')?.addEventListener('click', () => repayDetenteDebt(false));
    document.getElementById('btnDetenteRepayAll')?.addEventListener('click', () => repayDetenteDebt(true));
    document.getElementById('detenteRepayAmount')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); repayDetenteDebt(false); }
    });
    renderDetenteOdds();

    // Bons du banquier (GitHub)
    document.getElementById('detenteBons')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bon-claim]');
      if (btn && !btn.disabled) claimDetenteBon(btn.dataset.bonClaim);
    });
    startDetenteBonsPolling();

    window.addEventListener('resize', () => { if (state.detentePageOpen && detenteState.tab === 'slot' && !detenteState.spinning) renderDetenteReels(); });
    // La page capte tous ses gestes : rien ne doit atteindre la toile en dessous
    ['wheel', 'contextmenu'].forEach((type) => pageEl.addEventListener(type, (e) => {
      if (type === 'wheel' && e.ctrlKey) e.preventDefault();
      e.stopPropagation();
    }, { passive: false }));
  }

  function bindDetenteFundsModal() {
    const modal = document.getElementById('modalDetenteFunds');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';
    document.getElementById('btnCloseDetenteFunds')?.addEventListener('click', closeDetenteFundsModal);
    document.getElementById('btnCancelDetenteFunds')?.addEventListener('click', closeDetenteFundsModal);
    document.getElementById('btnDetenteFundsContinue')?.addEventListener('click', continueDetenteFundsAction);
    document.getElementById('btnDetenteFundsCode')?.addEventListener('click', () => submitDetenteCode('detenteFundsCode', 'detenteFundsMsg'));
    document.getElementById('detenteFundsCode')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitDetenteCode('detenteFundsCode', 'detenteFundsMsg'); }
    });
    document.getElementById('btnDetenteFundsBank')?.addEventListener('click', () => {
      closeDetenteFundsModal();
      detenteState.tab = 'bank';
      openDetentePage();
    });
  }

  function handleDetenteKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDetentePage();
      return;
    }
    const tag = e.target && e.target.tagName;
    // Un champ de saisie (code, montant) garde toutes ses touches
    if (tag === 'INPUT' && e.target.type !== 'range') return;
    if (detenteState.tab !== 'slot') return;
    if ((e.key === ' ' || e.key === 'Enter') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Espace / Entrée lancent, sauf sur un bouton ou un curseur qui a le focus (comportement natif)
      if (tag === 'BUTTON' || tag === 'INPUT' || (e.target && e.target.id === 'detenteLever')) return;
      e.preventDefault();
      pullDetenteLever();
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === '+') && tag !== 'INPUT') { e.preventDefault(); changeDetenteBet(1); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === '-') && tag !== 'INPUT') { e.preventDefault(); changeDetenteBet(-1); return; }
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      closeDetentePage();
    }
  }

  function openDetentePage() {
    const pageEl = document.getElementById('detentePage');
    if (!pageEl) return false;
    initDetentePage();
    finalizeActiveDrawingOnCurrentPage();
    flushPendingPageSaves();
    if (state.filesPageOpen) closeFilesPage();
    if (state.colorWheelOpen) closeRadialColorWheel(true);
    if (gnColorPopoverState.open) closeGnColorPopover();
    state.detentePageOpen = true;
    pageEl.classList.remove('hidden');
    document.getElementById('btnOpenDetente')?.classList.add('active');
    setDetenteTab(detenteState.tab);
    renderDetenteBons();
    if (detenteBons.started && Date.now() - detenteBons.lastFetch > DETENTE_BONS_MIN_REFRESH_MS) refreshDetenteBons();
    // Retire le focus de la toile ou de la barre d'outils : Espace et Entrée lancent la machine
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    return true;
  }

  function closeDetentePage() {
    const pageEl = document.getElementById('detentePage');
    state.detentePageOpen = false;
    detenteState.leverDrag = null;
    if (pageEl) pageEl.classList.add('hidden');
    document.getElementById('btnOpenDetente')?.classList.remove('active');
    if (detenteState.audioCtx && detenteState.audioCtx.state === 'running') {
      detenteState.audioCtx.suspend().catch(() => {});
    }
    if (document.activeElement && pageEl && pageEl.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    requestRender();
    return false;
  }

  function toggleDetentePage() {
    return state.detentePageOpen ? closeDetentePage() : openDetentePage();
  }

  function openFilesPage(initialTab) {
    const pageEl = document.getElementById('gnFilesPage');
    if (!pageEl) return false;
    finalizeActiveDrawingOnCurrentPage();
    flushPendingPageSaves();
    if (initialTab) state.filesPageTab = initialTab;
    if (state.detentePageOpen) closeDetentePage();
    state.filesPageOpen = true;
    closeGnFilesMenus();
    pageEl.classList.remove('hidden');
    const triggerBtn = document.getElementById('btnOpenFilesView');
    if (triggerBtn) triggerBtn.classList.add('active');
    renderGnFilesPage();
    return true;
  }

  function closeFilesPage() {
    const pageEl = document.getElementById('gnFilesPage');
    state.filesPageOpen = false;
    state.filesPageSelectMode = false;
    state.filesPageSelectedIds.clear();
    closeGnFilesMenus();
    if (pageEl) pageEl.classList.add('hidden');
    const triggerBtn = document.getElementById('btnOpenFilesView');
    if (triggerBtn) triggerBtn.classList.remove('active');
    requestRender();
    return false;
  }

  function toggleFilesPage() {
    return state.filesPageOpen ? closeFilesPage() : openFilesPage();
  }

  function initGnFilesPageEvents() {
    const triggerBtn = document.getElementById('btnOpenFilesView');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => toggleFilesPage());
    }

    document.getElementById('btnCloseFilesPage')?.addEventListener('click', closeFilesPage);
    document.getElementById('btnFilesReturnToCanvas')?.addEventListener('click', closeFilesPage);
    document.getElementById('btnFilesCloudBackup')?.addEventListener('click', () => openCloudBackupModal());

    // Navigation latérale GoodNotes + Drop targets (Documents = racine, Corbeille = supprimer)
    document.querySelectorAll('#gnFilesSidebarNav [data-files-tab]').forEach((btn) => {
      const tabKey = btn.dataset.filesTab;
      btn.addEventListener('click', () => {
        closeGnFilesMenus();
        state.filesPageTab = tabKey || 'all';
        if (tabKey === 'all') state.currentFolderId = null;
        state.filesPageSelectMode = false;
        state.filesPageSelectedIds.clear();
        renderGnFilesPage();
      });
      if (tabKey === 'all' || tabKey === 'trash') {
        btn.addEventListener('dragover', (ev) => {
          if (!draggedFilesItem) return;
          ev.preventDefault();
          btn.classList.add('drag-over');
        });
        btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
        btn.addEventListener('drop', async (ev) => {
          ev.preventDefault();
          btn.classList.remove('drag-over');
          if (!draggedFilesItem) return;
          const item = draggedFilesItem;
          draggedFilesItem = null;
          if (tabKey === 'all') {
            if (item.type === 'nb') moveNotebookToFolder(item.id, null);
            else if (item.type === 'fld') moveFolderToParent(item.id, null);
          } else if (tabKey === 'trash') {
            if (item.type === 'nb') await moveNotebookToTrash(item.id);
            else if (item.type === 'fld') await moveFolderToTrash(item.id);
          }
        });
      }
    });

    // Bouton Retour dossier parent
    document.getElementById('btnGnFilesBack')?.addEventListener('click', () => {
      if (!state.currentFolderId) return;
      const cur = (state.folders || []).find((f) => f.id === state.currentFolderId);
      state.currentFolderId = cur ? (cur.parentId || null) : null;
      renderNotebooksSidebar();
    });

    // Recherche instantanée
    const searchInput = document.getElementById('gnFilesSearchInput');
    const searchClear = document.getElementById('btnGnFilesSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.sidebarSearch = searchInput.value || '';
        renderNotebooksSidebar();
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        state.sidebarSearch = '';
        if (searchInput) searchInput.value = '';
        renderNotebooksSidebar();
      });
    }

    // Tri
    const sortSel = document.getElementById('gnFilesSortSelect');
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        state.notebookSortBy = sortSel.value || 'date_desc';
        state.sidebarSort = (state.notebookSortBy === 'name_asc' || state.notebookSortBy === 'name_desc') ? 'name' : 'date';
        syncSortControlsUi();
        renderNotebooksSidebar();
      });
    }

    // Mode Grille / Liste
    document.getElementById('btnGnFilesViewGrid')?.addEventListener('click', () => {
      state.filesPageViewMode = 'grid';
      renderGnFilesPage();
    });
    document.getElementById('btnGnFilesViewList')?.addEventListener('click', () => {
      state.filesPageViewMode = 'list';
      renderGnFilesPage();
    });

    // Bouton "+ Nouveau" dans l'en-tête
    const topNewBtn = document.getElementById('btnGnFilesTopNew');
    if (topNewBtn) {
      topNewBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGnFilesNewMenu(topNewBtn);
      });
    }

    // Actions du popover "+ Nouveau"
    document.querySelectorAll('#gnFilesNewMenu [data-new-action]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const act = btn.dataset.newAction;
        closeGnFilesMenus();
        if (act === 'notebook') {
          if (dom.inputNotebookName) dom.inputNotebookName.value = '';
          if (typeof updateNewNotebookPaperPreview === 'function') updateNewNotebookPaperPreview();
          if (dom.modalNewNotebook) dom.modalNewNotebook.classList.remove('hidden');
        } else if (act === 'folder') {
          openFolderCustomizeModal(null);
        } else if (act === 'quicknote') {
          const curPage = getActivePage();
          const created = await paidCreateNotebook(
            `Note rapide ${state.notebooks.length + 1}`,
            curPage ? curPage.paperType : 'grid',
            state.newNotebookCover,
            curPage
          );
          if (created) closeFilesPage();
        } else if (act === 'import-pdf') {
          if (dom.modalImportPdf) dom.modalImportPdf.classList.remove('hidden');
        }
      });
    });

    // Filtres Favoris (Tous / Cahiers / Dossiers)
    document.querySelectorAll('#gnFilesFavFilterBar [data-fav-filter]').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.filesPageFavFilter = pill.dataset.favFilter || 'any';
        renderGnFilesPage();
      });
    });

    // Mode sélection multiple GoodNotes
    document.getElementById('btnGnFilesSelectMode')?.addEventListener('click', () => {
      state.filesPageSelectMode = !state.filesPageSelectMode;
      if (!state.filesPageSelectMode) state.filesPageSelectedIds.clear();
      renderGnFilesPage();
    });
    document.getElementById('btnGnFilesSelDone')?.addEventListener('click', () => {
      state.filesPageSelectMode = false;
      state.filesPageSelectedIds.clear();
      renderGnFilesPage();
    });
    document.getElementById('btnGnFilesSelAll')?.addEventListener('click', () => {
      const { folders, notebooks } = getGnFilesVisibleData();
      const allKeys = [...folders.map((f) => `fld:${f.id}`), ...notebooks.map((n) => `nb:${n.id}`)];
      if (state.filesPageSelectedIds.size === allKeys.length && allKeys.length > 0) {
        state.filesPageSelectedIds.clear();
      } else {
        allKeys.forEach((k) => state.filesPageSelectedIds.add(k));
      }
      renderGnFilesPage();
    });

    const getSelectedParsed = () => Array.from(state.filesPageSelectedIds).map((k) => {
      const idx = k.indexOf(':');
      return { type: k.slice(0, idx), id: k.slice(idx + 1) };
    });

    document.getElementById('btnGnFilesSelMove')?.addEventListener('click', async () => {
      const items = getSelectedParsed();
      if (items.length === 0) return;
      if (state.filesPageTab === 'trash') {
        for (const it of items) {
          if (it.type === 'nb') await restoreNotebookFromTrash(it.id);
          else if (it.type === 'fld') await restoreFolderFromTrash(it.id);
        }
        state.filesPageSelectMode = false;
        state.filesPageSelectedIds.clear();
        renderGnFilesPage();
        return;
      }
      openMoveNotebookModal(items);
    });

    document.getElementById('btnGnFilesSelStar')?.addEventListener('click', () => {
      const items = getSelectedParsed();
      if (items.length === 0) return;
      let foldersDirty = false;
      items.forEach((it) => {
        if (it.type === 'nb') {
          const nb = state.notebooks.find((n) => n.id === it.id);
          if (nb) { nb.starred = !nb.starred; nb.updatedAt = Date.now(); db.saveNotebook(nb); }
        } else if (it.type === 'fld') {
          const fld = (state.folders || []).find((f) => f.id === it.id);
          if (fld) { fld.starred = !fld.starred; fld.updatedAt = Date.now(); foldersDirty = true; }
        }
      });
      if (foldersDirty) db.saveFolders(state.folders);
      renderNotebooksSidebar();
    });

    document.getElementById('btnGnFilesSelDuplicate')?.addEventListener('click', async () => {
      const items = getSelectedParsed().filter((it) => it.type === 'nb');
      if (items.length === 0) return;
      for (const it of items) await duplicateNotebookById(it.id);
      state.filesPageSelectMode = false;
      state.filesPageSelectedIds.clear();
      renderGnFilesPage();
    });

    document.getElementById('btnGnFilesSelTrash')?.addEventListener('click', async () => {
      const items = getSelectedParsed();
      if (items.length === 0) return;
      const inTrash = state.filesPageTab === 'trash';
      for (const it of items) {
        if (inTrash) {
          if (it.type === 'nb') await deleteNotebookById(it.id);
          else if (it.type === 'fld') await deleteFolderPermanently(it.id);
        } else {
          if (it.type === 'nb') await moveNotebookToTrash(it.id);
          else if (it.type === 'fld') await moveFolderToTrash(it.id);
        }
      }
      state.filesPageSelectMode = false;
      state.filesPageSelectedIds.clear();
      renderGnFilesPage();
    });

    // Actions Corbeille globale
    document.getElementById('btnGnFilesRestoreAll')?.addEventListener('click', async () => {
      const trashedNbs = state.notebooks.filter((n) => Boolean(n.trashedAt));
      const trashedFlds = (state.folders || []).filter((f) => Boolean(f.trashedAt));
      for (const fld of trashedFlds) await restoreFolderFromTrash(fld.id);
      for (const nb of trashedNbs) await restoreNotebookFromTrash(nb.id);
      renderGnFilesPage();
    });
    document.getElementById('btnGnFilesEmptyTrash')?.addEventListener('click', async () => {
      await emptyTrash();
      renderGnFilesPage();
    });

    // Fermer les popovers au clic en dehors
    const pageEl = document.getElementById('gnFilesPage');
    if (pageEl) {
      pageEl.addEventListener('click', (ev) => {
        if (!ev.target.closest('#gnFilesNewMenu') && !ev.target.closest('#gnFilesContextMenu')) {
          closeGnFilesMenus();
        }
      });
    }
  }

  let gdriveAutoBackupInterval = null;
  function initGoodnotesExtensions() {
    initGnFilesPageEvents();
    initDetentePage();
    initRadialWheelEditor();
    // 1. Dossiers, Recherche, Tri, Vue Grille/Liste, Corbeille & Favoris Goodnotes
    const btnNewFolder = document.getElementById('btnNewFolder');
    if (btnNewFolder) {
      btnNewFolder.addEventListener('click', () => {
        openFolderCustomizeModal(null);
      });
    }

    document.querySelectorAll('#folderColorSwatches [data-folder-color]').forEach((sw) => {
      sw.addEventListener('click', () => {
        state.folderModalColor = sw.dataset.folderColor || '#0072ce';
        document.querySelectorAll('#folderColorSwatches [data-folder-color]').forEach((x) => x.classList.toggle('active', x === sw));
      });
    });

    const btnAddFolderColor = document.getElementById('btnAddFolderColor');
    if (btnAddFolderColor) {
      btnAddFolderColor.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGnColorPopover({
          mode: 'folder-color',
          toolKey: 'pen',
          scopeKey: 'folder',
          anchorEl: btnAddFolderColor,
          initialColor: state.folderModalColor || '#0072ce'
        });
      });
    }

    document.querySelectorAll('#folderSymbolPills [data-folder-icon]').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.folderModalIcon = pill.dataset.folderIcon || 'folder';
        document.querySelectorAll('#folderSymbolPills [data-folder-icon]').forEach((x) => x.classList.toggle('active', x === pill));
      });
    });

    document.getElementById('btnCloseFolderCustomizeModal')?.addEventListener('click', closeFolderCustomizeModal);
    document.getElementById('btnCancelFolderCustomizeModal')?.addEventListener('click', closeFolderCustomizeModal);
    document.getElementById('btnConfirmFolderCustomizeModal')?.addEventListener('click', () => {
      const nameInput = document.getElementById('inputFolderCustomizeName');
      const name = (nameInput && nameInput.value.trim()) || 'Nouveau dossier';
      if (state.editingFolderId) {
        const existing = (state.folders || []).find((f) => f.id === state.editingFolderId);
        if (existing) {
          existing.name = name;
          existing.color = state.folderModalColor || '#0072ce';
          existing.icon = state.folderModalIcon || 'folder';
          existing.updatedAt = Date.now();
        }
      } else {
        state.folders.push({
          id: createUid('fld'),
          name,
          parentId: state.currentFolderId || null,
          color: state.folderModalColor || '#0072ce',
          icon: state.folderModalIcon || 'folder',
          starred: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      db.saveFolders(state.folders);
      renderNotebooksSidebar();
      closeFolderCustomizeModal();
      showToast(`Dossier « ${name} » enregistré`);
    });

    // Double-clic sur "+ Nouveau" -> Note rapide instantanée sans ouvrir la modale (flux GoodNotes Quick Note)
    if (dom.btnNewNotebook) {
      dom.btnNewNotebook.addEventListener('dblclick', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (dom.modalNewNotebook) dom.modalNewNotebook.classList.add('hidden');
        const curPage = getActivePage();
        await paidCreateNotebook(
          `Note rapide ${state.notebooks.length + 1}`,
          curPage ? curPage.paperType : 'grid',
          state.newNotebookCover,
          curPage
        );
      });
    }

    const sortSelect = document.getElementById('notebookSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        state.notebookSortBy = sortSelect.value || 'date_desc';
        state.sidebarSort = (state.notebookSortBy === 'name_asc' || state.notebookSortBy === 'name_desc') ? 'name' : 'date';
        syncSortControlsUi();
        renderNotebooksSidebar();
      });
    }

    const btnSortDocs = document.getElementById('btnSortDocs');
    if (btnSortDocs) {
      btnSortDocs.addEventListener('click', () => {
        state.sidebarSort = state.sidebarSort === 'name' ? 'date' : 'name';
        state.notebookSortBy = state.sidebarSort === 'name' ? 'name_asc' : 'date_desc';
        syncSortControlsUi();
        renderNotebooksSidebar();
      });
    }
    syncSortControlsUi();

    const btnToggleLibraryView = document.getElementById('btnToggleLibraryView');
    if (btnToggleLibraryView) {
      btnToggleLibraryView.addEventListener('click', () => {
        state.libraryViewMode = state.libraryViewMode === 'grid' ? 'list' : 'grid';
        btnToggleLibraryView.classList.toggle('active', state.libraryViewMode === 'grid');
        renderNotebooksSidebar();
      });
    }

    const btnEmptyTrash = document.getElementById('btnEmptyTrash');
    if (btnEmptyTrash) {
      btnEmptyTrash.addEventListener('click', () => {
        emptyTrash();
      });
    }

    // Sous-onglets Pages / Plan / Favoris
    document.querySelectorAll('#pagesSubTabs [data-pages-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.pagesSubTab = btn.dataset.pagesSubtab || 'pages';
        state.pagesFilterBookmarks = state.pagesSubTab === 'bookmarks';
        document.querySelectorAll('#pagesSubTabs [data-pages-subtab]').forEach((b) => b.classList.toggle('active', b === btn));
        const bmBtn = document.getElementById('btnFilterBookmarkedPages');
        if (bmBtn) bmBtn.classList.toggle('active', state.pagesFilterBookmarks);
        renderPagesSidebar();
      });
    });

    const btnAddOutlineEntry = document.getElementById('btnAddOutlineEntry');
    if (btnAddOutlineEntry) {
      btnAddOutlineEntry.addEventListener('click', () => {
        const curPage = getActivePage();
        openRenameModal(
          'Ajouter une entrée au Plan',
          curPage ? curPage.title : 'Chapitre',
          (val) => {
            addOutlineEntryForPage(state.activePageId, val, 1);
            showToast('Section ajoutée au Plan');
          }
        );
      });
    }

    const searchInput = document.getElementById('sidebarSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.sidebarSearch = searchInput.value || '';
        renderNotebooksSidebar();
      });
    }

    document.querySelectorAll('.gn-filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.sidebarFilter = pill.dataset.filter || 'all';
        document.querySelectorAll('.gn-filter-pill').forEach((p) => p.classList.toggle('active', p === pill));
        renderNotebooksSidebar();
      });
    });

    const btnFilterBm = document.getElementById('btnFilterBookmarkedPages');
    if (btnFilterBm) {
      btnFilterBm.addEventListener('click', () => {
        state.pagesFilterBookmarks = !state.pagesFilterBookmarks;
        state.pagesSubTab = state.pagesFilterBookmarks ? 'bookmarks' : 'pages';
        btnFilterBm.classList.toggle('active', state.pagesFilterBookmarks);
        document.querySelectorAll('#pagesSubTabs [data-pages-subtab]').forEach((b) => {
          b.classList.toggle('active', b.dataset.pagesSubtab === state.pagesSubTab);
        });
        renderPagesSidebar();
      });
    }

    // Modal déplacer cahier / dossier / sélection multiple
    const moveModal = document.getElementById('modalMoveNotebook');
    const closeMove = () => { if (moveModal) moveModal.classList.add('hidden'); state.movingNotebookId = null; state.movingItems = null; };
    document.getElementById('btnCloseMoveNotebookModal')?.addEventListener('click', closeMove);
    document.getElementById('btnCancelMoveNotebookModal')?.addEventListener('click', closeMove);
    document.getElementById('btnConfirmMoveNotebookModal')?.addEventListener('click', () => {
      const sel = document.getElementById('selectTargetFolder');
      const targetFolderId = (sel && sel.value) || null;
      const items = Array.isArray(state.movingItems) && state.movingItems.length
        ? state.movingItems
        : (state.movingNotebookId ? [{ type: 'nb', id: state.movingNotebookId }] : []);
      let movedCount = 0;
      let foldersDirty = false;
      items.forEach((item) => {
        if (item.type === 'nb') {
          const nb = state.notebooks.find((n) => n.id === item.id);
          if (nb && (nb.folderId || null) !== targetFolderId) {
            nb.folderId = targetFolderId;
            nb.updatedAt = Date.now();
            db.saveNotebook(nb);
            movedCount++;
          }
        } else if (item.type === 'fld') {
          const fld = (state.folders || []).find((f) => f.id === item.id);
          if (fld && (fld.parentId || null) !== targetFolderId && (!targetFolderId || !isFolderDescendant(targetFolderId, fld.id))) {
            fld.parentId = targetFolderId;
            fld.updatedAt = Date.now();
            foldersDirty = true;
            movedCount++;
          }
        }
      });
      if (foldersDirty) db.saveFolders(state.folders);
      if (movedCount > 0) {
        if (state.filesPageSelectMode) {
          state.filesPageSelectMode = false;
          state.filesPageSelectedIds.clear();
        }
        renderNotebooksSidebar();
        showToast(movedCount > 1 ? `${movedCount} éléments déplacés !` : 'Élément déplacé !');
      }
      closeMove();
    });

    // 2. Styles de stylo Goodnotes (Plume / Bille / Pinceau) + Styles de trait (Continu / Tirets / Pointillé) + Options Surligneur, Gomme & Lasso
    document.querySelectorAll('#penStylePills [data-penstyle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.penStyle = btn.dataset.penstyle || 'fountain';
        document.querySelectorAll('#penStylePills [data-penstyle]').forEach((b) => b.classList.toggle('active', b === btn));
        showToast(`Pointe : ${btn.textContent}`);
      });
    });

    document.querySelectorAll('#penLineStylePills [data-line-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.penLineStyle = btn.dataset.lineStyle || 'solid';
        document.querySelectorAll('#penLineStylePills [data-line-style]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    const hlAutoToggle = document.getElementById('hlAutoStraightenToggle');
    if (hlAutoToggle) {
      hlAutoToggle.checked = Boolean(state.highlighterAutoStraighten);
      hlAutoToggle.addEventListener('change', () => {
        state.highlighterAutoStraighten = Boolean(hlAutoToggle.checked);
      });
    }

    const eraserHlOnlyToggle = document.getElementById('eraserHighlighterOnlyToggle');
    if (eraserHlOnlyToggle) {
      eraserHlOnlyToggle.checked = Boolean(state.eraserHighlighterOnly);
      eraserHlOnlyToggle.addEventListener('change', () => {
        state.eraserHighlighterOnly = Boolean(eraserHlOnlyToggle.checked);
      });
    }

    const eraserAutoDeselectToggle = document.getElementById('eraserAutoDeselectToggle');
    if (eraserAutoDeselectToggle) {
      eraserAutoDeselectToggle.checked = Boolean(state.eraserAutoDeselect);
      eraserAutoDeselectToggle.addEventListener('change', () => {
        state.eraserAutoDeselect = Boolean(eraserAutoDeselectToggle.checked);
      });
    }

    document.querySelectorAll('#lassoModePills [data-lasso-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.lassoMode = btn.dataset.lassoMode || 'freehand';
        document.querySelectorAll('#lassoModePills [data-lasso-mode]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    // 3. Insertion d'images / stickers + Coller depuis le presse-papiers (Ctrl+V)
    const btnInsertImg = document.getElementById('btnInsertImage');
    const inputImg = document.getElementById('inputInsertImage');
    if (btnInsertImg && inputImg) {
      btnInsertImg.addEventListener('click', () => inputImg.click());
      inputImg.addEventListener('change', (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (file) readFileAsImageAndInsert(file);
        inputImg.value = '';
      });
    }
    window.addEventListener('paste', (ev) => {
      const ae = document.activeElement;
      const tag = ae && ae.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae && ae.isContentEditable)) return;
      const cd = ev.clipboardData;
      if (!cd) return;
      if (cd.items && cd.items.length > 0) {
        for (const item of cd.items) {
          if (item.type && item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) {
              ev.preventDefault();
              readFileAsImageAndInsert(f);
              return;
            }
          }
        }
      }
      if (cd.files && cd.files.length > 0) {
        for (const f of cd.files) {
          if (f && f.type && f.type.startsWith('image/')) {
            ev.preventDefault();
            readFileAsImageAndInsert(f);
            return;
          }
        }
      }
    });

    // 4. Sauvegarde Cloud (dossier local synchronisé + compte Google relié) et sélecteur Drive
    const gdModal = document.getElementById('modalGoogleDrive');
    const setCloudBackupTab = (tab) => {
      const isApi = tab === 'api';
      const localPanel = document.getElementById('cloudTabLocal');
      const apiPanel = document.getElementById('cloudTabApi');
      const btnLocal = document.getElementById('btnCloudTabLocal');
      const btnApi = document.getElementById('btnCloudTabApi');
      if (localPanel) localPanel.classList.toggle('hidden', isApi);
      if (apiPanel) apiPanel.classList.toggle('hidden', !isApi);
      if (btnLocal) {
        btnLocal.classList.toggle('active', !isApi);
        btnLocal.setAttribute('aria-selected', isApi ? 'false' : 'true');
      }
      if (btnApi) {
        btnApi.classList.toggle('active', isApi);
        btnApi.setAttribute('aria-selected', isApi ? 'true' : 'false');
      }
    };
    setCloudBackupTabRef = setCloudBackupTab;
    document.querySelectorAll('#modalGoogleDrive [data-cloud-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setCloudBackupTab(btn.dataset.cloudTab));
    });

    loadGdriveSession();
    const inputClient = document.getElementById('inputGdriveClientId');
    const inputSecret = document.getElementById('inputGdriveClientSecret');
    if (inputClient && state.gdriveClientId) inputClient.value = state.gdriveClientId;
    if (inputSecret && state.gdriveClientSecret) inputSecret.value = state.gdriveClientSecret;
    [inputClient, inputSecret].forEach((input) => {
      if (input) input.addEventListener('change', () => { readGdriveCredentialInputs(); renderGdriveAccountUi(); });
    });
    const chkAutoInit = document.getElementById('chkGdriveAutoBackup');
    if (chkAutoInit) chkAutoInit.checked = state.gdriveAutoBackup;
    if (isGdriveLinked()) setCloudBackupTab('api');
    initNetworkIndicator();
    renderGdriveAccountUi();

    document.getElementById('btnOpenGoogleDrive')?.addEventListener('click', () => openCloudBackupModal());
    document.getElementById('btnCloseGoogleDriveModal')?.addEventListener('click', () => {
      if (gdModal) gdModal.classList.add('hidden');
    });
    document.getElementById('btnDoneGoogleDriveModal')?.addEventListener('click', () => {
      if (gdModal) gdModal.classList.add('hidden');
    });
    if (gdModal) {
      gdModal.addEventListener('click', (ev) => {
        if (ev.target === gdModal) gdModal.classList.add('hidden');
      });
    }

    document.getElementById('btnPickLocalDriveFolder')?.addEventListener('click', async () => {
      if (typeof window.showDirectoryPicker !== 'function') {
        showToast('Votre navigateur ne supporte pas le sélecteur de dossier (utilisez Electron / Edge / Chrome).');
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        state.gdriveLocalDirHandle = handle;
        const btnSync = document.getElementById('btnSyncLocalDriveNow');
        if (btnSync) btnSync.disabled = false;
        updateGdriveStatusUi(`Dossier local connecté : ${handle.name}`, true);
        await syncToLocalDriveFolderNow();
      } catch (_) {}
    });
    document.getElementById('btnSyncLocalDriveNow')?.addEventListener('click', () => syncToLocalDriveFolderNow());

    // Compte Google
    document.getElementById('btnGdriveLink')?.addEventListener('click', () => gdriveLinkAccount());
    document.getElementById('btnGdriveCancelLink')?.addEventListener('click', () => gdriveCancelLink());
    document.getElementById('btnGdriveUnlink')?.addEventListener('click', () => gdriveUnlink());
    document.getElementById('btnGdriveUseManualToken')?.addEventListener('click', () => gdriveUseManualToken());
    document.getElementById('btnGdriveSyncIncremental')?.addEventListener('click', () => {
      if (!requireNetwork('Synchronisation Google Drive')) return;
      syncNotebooksIncrementalWithGoogleDrive({ auto: false });
    });
    document.getElementById('btnGdriveBackupNow')?.addEventListener('click', () => {
      if (!requireNetwork('Sauvegarde Google Drive')) return;
      backupToGoogleDriveApiNow();
    });
    document.getElementById('btnGdriveListBackups')?.addEventListener('click', () => listGoogleDriveBackups());
    document.getElementById('btnGdriveOpenPicker')?.addEventListener('click', () => {
      if (!requireNetwork('Importer depuis Google Drive')) return;
      openDrivePicker({ from: 'cloud' });
    });
    document.getElementById('btnImportPdfFromDrive')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!requireNetwork('Importer un PDF depuis Google Drive')) return;
      openDrivePicker({ filter: 'pdf', from: 'pdf' });
    });

    // Sélecteur Drive
    const pickerModal = document.getElementById('modalDrivePicker');
    document.getElementById('btnCloseDrivePicker')?.addEventListener('click', closeDrivePicker);
    document.getElementById('btnCancelDrivePicker')?.addEventListener('click', closeDrivePicker);
    if (pickerModal) {
      pickerModal.addEventListener('click', (ev) => {
        if (ev.target === pickerModal && !drivePicker.importing) closeDrivePicker();
      });
    }
    document.querySelectorAll('#modalDrivePicker [data-drive-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.driveView;
        drivePicker.view = view;
        drivePicker.stack = view === 'root' ? [{ id: 'root', name: DRIVE_VIEW_LABELS.root }] : [];
        drivePicker.search = '';
        const input = document.getElementById('drivePickerSearch');
        if (input) input.value = '';
        reloadDrivePicker();
      });
    });
    document.querySelectorAll('#modalDrivePicker [data-drive-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (drivePicker.filter === chip.dataset.driveFilter) return;
        drivePicker.filter = chip.dataset.driveFilter;
        reloadDrivePicker();
      });
    });
    const pickerSearch = document.getElementById('drivePickerSearch');
    if (pickerSearch) {
      pickerSearch.addEventListener('input', () => {
        clearTimeout(drivePicker.searchTimer);
        drivePicker.searchTimer = setTimeout(() => {
          const next = pickerSearch.value.trim();
          if (next === drivePicker.search.trim()) return;
          drivePicker.search = next;
          reloadDrivePicker();
        }, 350);
      });
    }
    document.getElementById('btnDrivePickerMore')?.addEventListener('click', () => loadDrivePickerItems({ append: true }));
    document.getElementById('btnDrivePickerImport')?.addEventListener('click', () => importSelectedDriveFiles());

    // Sauvegarde automatique : synchro incrémentale différée hors connexion, relancée au retour du réseau
    const runGdriveAutoBackupTick = () => {
      if (state.gdriveLocalDirHandle) syncToLocalDriveFolderNow();
      else if (isGdriveLinked()) {
        if (typeof syncNotebooksIncrementalWithGoogleDrive === 'function') {
          syncNotebooksIncrementalWithGoogleDrive({ auto: true });
        } else {
          backupToGoogleDriveApiNow({ auto: true });
        }
      }
    };
    const applyGdriveAutoBackup = (announce) => {
      if (gdriveAutoBackupInterval) clearInterval(gdriveAutoBackupInterval);
      gdriveAutoBackupInterval = null;
      if (!state.gdriveAutoBackup) return;
      gdriveAutoBackupInterval = setInterval(runGdriveAutoBackupTick, 5 * 60 * 1000);
      if (announce) showToast('Sauvegarde automatique activée (toutes les 5 min).');
    };
    const chkAuto = document.getElementById('chkGdriveAutoBackup');
    if (chkAuto) {
      chkAuto.addEventListener('change', () => {
        state.gdriveAutoBackup = chkAuto.checked;
        writeLocalSetting(GDRIVE_KEYS.auto, String(state.gdriveAutoBackup));
        applyGdriveAutoBackup(state.gdriveAutoBackup);
      });
    }
    applyGdriveAutoBackup(false);

    onNetworkChange((available) => {
      if (!available) return;
      if (gdrivePendingAutoBackup && state.gdriveAutoBackup && isGdriveLinked()) {
        if (typeof syncNotebooksIncrementalWithGoogleDrive === 'function') {
          syncNotebooksIncrementalWithGoogleDrive({ auto: true });
        } else {
          backupToGoogleDriveApiNow({ auto: true });
        }
      }
      if (isDrivePickerOpen() && (drivePicker.needsReload || (!drivePicker.items.length && !drivePicker.loading))) reloadDrivePicker();
    });

    // 5. Raccourcis clavier Goodnotes (Maj+R = Ruban, K = Laser ; R seul = Règle)
    window.addEventListener('keydown', (e) => {
      if (isKeyboardTypingTarget(e.target) || isKeyboardTypingTarget(document.activeElement)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || isAnyModalOpen() || state.filesPageOpen || state.detentePageOpen) return;
      const k = e.key.toLowerCase();
      if (k === 'r' && e.shiftKey) setActiveTool('tape', false);
      else if (k === 'k') setActiveTool('laser', false);
    });
  }

  async function loadFromIndexedDB() {
    try {
      let [notebooks, savedFolders, ws] = await Promise.all([
        db.getAllNotebooks(),
        db.getFolders(),
        db.getWorkspaceState().catch(() => null)
      ]);
      if (Array.isArray(savedFolders)) state.folders = savedFolders;
      if (!notebooks || notebooks.length === 0) {
        const demo = createDemoNotebookAndPages();
        for (const nb of demo.notebooks) await db.saveNotebook(nb);
        for (const pg of demo.pages) { pg.thumbnail = generatePageThumbnail(pg); await db.savePage(pg); }
        notebooks = demo.notebooks;
      }
      state.notebooks = notebooks;
      state.pagesByNotebook.clear();
      for (const nb of state.notebooks) {
        const pages = await db.getPagesForNotebook(nb.id);
        pages.forEach((p) => { if (!p.viewMode) p.viewMode = 'infinite'; });
        state.pagesByNotebook.set(nb.id, pages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      }
      // Rouvre le dernier cahier/page actif enregistré, sinon le premier cahier hors corbeille
      const savedNb = ws && ws.activeNotebookId
        ? state.notebooks.find((n) => n.id === ws.activeNotebookId && !n.trashedAt)
        : null;
      const startNb = savedNb || state.notebooks.find((n) => !n.trashedAt) || state.notebooks[0];
      state.activeNotebookId = startNb.id;
      const startPages = getActiveNotebookPages();
      const savedPg = savedNb && ws.activePageId ? startPages.find((p) => p.id === ws.activePageId) : null;
      state.activePageId = (savedPg || startPages[0])?.id;
    } catch (_) {
      if (!state.notebooks || state.notebooks.length === 0) applyDemoStateSynchronously();
    }
    initialDbLoadPromise = null;
    ensureActiveAndAdjacentPdfPagesLoaded(getActivePage());
    renderNotebooksSidebar();
    renderPagesSidebar();
    loadOpenNotebookTabs();
    syncOpenTabsWithActiveNotebook();
    updateToolbarActiveState();
    renderWorldTextCards();
    fitPageToViewport();
    requestRender();
  }

