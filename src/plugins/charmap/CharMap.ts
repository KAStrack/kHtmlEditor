export type CharEntry = [number, string];
export interface CharGroup {
  name: string;
  characters: CharEntry[];
}

/** Default character map (a subset of TinyMCE's, grouped the same way). */
export const defaultCharMap: CharGroup[] = [
  {
    name: 'Currency',
    characters: [
      [36, 'dollar sign'], [162, 'cent sign'], [8364, 'euro sign'], [163, 'pound sign'], [165, 'yen sign'], [164, 'currency sign'], [8352, 'euro-currency sign'], [8353, 'colon sign'], [8359, 'peseta sign'], [8361, 'won sign'], [8362, 'new sheqel sign'], [8363, 'dong sign'], [8369, 'peso sign'], [8371, 'hryvnia sign'], [8377, 'indian rupee sign'], [8378, 'turkish lira sign'], [8381, 'ruble sign'], [8372, 'cedi sign'], [8373, 'livre tournois sign'], [8375, 'spesmilo sign'], [8376, 'tenge sign'], [8360, 'rupee sign'], [8365, 'kip sign'], [8366, 'tugrik sign'], [8367, 'drachma sign'], [8368, 'german penny symbol'], [8370, 'guarani sign'], [8374, 'austral sign'], [8382, 'bitcoin sign'],
    ],
  },
  {
    name: 'Text',
    characters: [
      [169, 'copyright sign'], [174, 'registered sign'], [8482, 'trade mark sign'], [8240, 'per mille sign'], [181, 'micro sign'], [183, 'middle dot'], [8226, 'bullet'], [8230, 'three dot leader'], [8242, 'minutes / feet'], [8243, 'seconds / inches'], [167, 'section sign'], [182, 'paragraph sign'], [223, 'sharp s / ess-zed'], [8224, 'dagger'], [8225, 'double dagger'], [8470, 'numero sign'], [8451, 'degree celsius'], [8457, 'degree fahrenheit'], [176, 'degree sign'], [8471, 'sound recording copyright'], [8211, 'en dash'], [8212, 'em dash'], [8213, 'horizontal bar'],
    ],
  },
  {
    name: 'Quotations',
    characters: [
      [8216, 'single left-pointing angle quotation mark'], [8217, 'single right-pointing angle quotation mark'], [8220, 'left double quotation mark'], [8221, 'right double quotation mark'], [8218, 'single low-9 quotation mark'], [8222, 'double low-9 quotation mark'], [171, 'left pointing guillemet'], [187, 'right pointing guillemet'], [8249, 'single left-pointing angle quotation mark'], [8250, 'single right-pointing angle quotation mark'], [34, 'quotation mark'], [39, 'apostrophe'],
    ],
  },
  {
    name: 'Mathematical',
    characters: [
      [60, 'less-than sign'], [62, 'greater-than sign'], [8804, 'less-than or equal to'], [8805, 'greater-than or equal to'], [8211, 'en dash'], [8212, 'em dash'], [175, 'macron'], [8254, 'overline'], [180, 'acute accent'], [8730, 'square root'], [8734, 'infinity'], [8747, 'integral'], [8721, 'n-ary sumation'], [8719, 'n-ary product'], [8706, 'partial differential'], [8710, 'increment'], [8712, 'element of'], [8713, 'not an element of'], [8714, 'contains as member'], [8715, 'contains as member'], [8745, 'intersection'], [8746, 'union'], [8743, 'logical and'], [8744, 'logical or'], [172, 'not sign'], [8801, 'identical to'], [8800, 'not equal to'], [8776, 'almost equal to'], [8773, 'approximately equal to'], [8733, 'proportional to'], [8869, 'up tack'], [8756, 'therefore'], [8757, 'because'], [8707, 'there exists'], [8704, 'for all'], [8709, 'empty set'], [8722, 'minus sign'], [177, 'plus-minus sign'], [215, 'multiplication sign'], [247, 'division sign'], [8260, 'fraction slash'], [8240, 'per mille sign'], [189, 'fraction one half'], [188, 'fraction one quarter'], [190, 'fraction three quarters'], [8531, 'fraction one third'], [8532, 'fraction two thirds'], [8539, 'fraction one eighth'], [8540, 'fraction three eighths'], [8541, 'fraction five eighths'], [8542, 'fraction seven eighths'], [185, 'superscript one'], [178, 'superscript two'], [179, 'superscript three'], [8304, 'superscript zero'], [8308, 'superscript four'], [8309, 'superscript five'], [8310, 'superscript six'], [8311, 'superscript seven'], [8312, 'superscript eight'], [8313, 'superscript nine'], [8320, 'subscript zero'], [8321, 'subscript one'], [8322, 'subscript two'], [8323, 'subscript three'], [8324, 'subscript four'], [8325, 'subscript five'], [8326, 'subscript six'], [8327, 'subscript seven'], [8328, 'subscript eight'], [8329, 'subscript nine'], [8736, 'angle'], [8748, 'double integral'], [8749, 'triple integral'], [8750, 'contour integral'], [8764, 'tilde operator'], [8773, 'approximately equal to'], [8801, 'identical to'], [8834, 'subset of'], [8835, 'superset of'], [8838, 'subset of or equal to'], [8839, 'superset of or equal to'], [8853, 'circled plus'], [8855, 'circled times'], [8901, 'dot operator'], [8968, 'left ceiling'], [8969, 'right ceiling'], [8970, 'left floor'], [8971, 'right floor'], [9001, 'left-pointing angle bracket'], [9002, 'right-pointing angle bracket'], [8739, 'divides'], [8741, 'parallel to'], [8742, 'not parallel to'], [8465, 'black-letter capital i'], [8472, 'script capital p'], [8476, 'black-letter capital r'], [8501, 'alef symbol'], [8450, 'double-struck capital c'], [8469, 'double-struck capital n'], [8473, 'double-struck capital p'], [8474, 'double-struck capital q'], [8477, 'double-struck capital r'], [8484, 'double-struck capital z'],
    ],
  },
  {
    name: 'Extended Latin',
    characters: [
      [192, 'A - grave'], [193, 'A - acute'], [194, 'A - circumflex'], [195, 'A - tilde'], [196, 'A - diaeresis'], [197, 'A - ring above'], [256, 'A - macron'], [198, 'ligature AE'], [199, 'C - cedilla'], [200, 'E - grave'], [201, 'E - acute'], [202, 'E - circumflex'], [203, 'E - diaeresis'], [274, 'E - macron'], [204, 'I - grave'], [205, 'I - acute'], [206, 'I - circumflex'], [207, 'I - diaeresis'], [298, 'I - macron'], [208, 'ETH'], [209, 'N - tilde'], [210, 'O - grave'], [211, 'O - acute'], [212, 'O - circumflex'], [213, 'O - tilde'], [214, 'O - diaeresis'], [216, 'O - slash'], [332, 'O - macron'], [338, 'ligature OE'], [352, 'S - caron'], [217, 'U - grave'], [218, 'U - acute'], [219, 'U - circumflex'], [220, 'U - diaeresis'], [362, 'U - macron'], [221, 'Y - acute'], [376, 'Y - diaeresis'], [562, 'Y - macron'], [222, 'THORN'], [224, 'a - grave'], [225, 'a - acute'], [226, 'a - circumflex'], [227, 'a - tilde'], [228, 'a - diaeresis'], [229, 'a - ring above'], [257, 'a - macron'], [230, 'ligature ae'], [231, 'c - cedilla'], [232, 'e - grave'], [233, 'e - acute'], [234, 'e - circumflex'], [235, 'e - diaeresis'], [275, 'e - macron'], [236, 'i - grave'], [237, 'i - acute'], [238, 'i - circumflex'], [239, 'i - diaeresis'], [299, 'i - macron'], [240, 'eth'], [241, 'n - tilde'], [242, 'o - grave'], [243, 'o - acute'], [244, 'o - circumflex'], [245, 'o - tilde'], [246, 'o - diaeresis'], [248, 'o slash'], [333, 'o macron'], [339, 'ligature oe'], [353, 's - caron'], [249, 'u - grave'], [250, 'u - acute'], [251, 'u - circumflex'], [252, 'u - diaeresis'], [363, 'u - macron'], [253, 'y - acute'], [254, 'thorn'], [255, 'y - diaeresis'], [563, 'y - macron'], [913, 'Alpha'], [914, 'Beta'], [915, 'Gamma'], [916, 'Delta'], [917, 'Epsilon'], [918, 'Zeta'], [919, 'Eta'], [920, 'Theta'], [921, 'Iota'], [922, 'Kappa'], [923, 'Lambda'], [924, 'Mu'], [925, 'Nu'], [926, 'Xi'], [927, 'Omicron'], [928, 'Pi'], [929, 'Rho'], [931, 'Sigma'], [932, 'Tau'], [933, 'Upsilon'], [934, 'Phi'], [935, 'Chi'], [936, 'Psi'], [937, 'Omega'], [945, 'alpha'], [946, 'beta'], [947, 'gamma'], [948, 'delta'], [949, 'epsilon'], [950, 'zeta'], [951, 'eta'], [952, 'theta'], [953, 'iota'], [954, 'kappa'], [955, 'lambda'], [956, 'mu'], [957, 'nu'], [958, 'xi'], [959, 'omicron'], [960, 'pi'], [961, 'rho'], [962, 'final sigma'], [963, 'sigma'], [964, 'tau'], [965, 'upsilon'], [966, 'phi'], [967, 'chi'], [968, 'psi'], [969, 'omega'],
    ],
  },
  {
    name: 'Symbols',
    characters: [
      [8501, 'alef symbol'], [982, 'pi symbol'], [8476, 'real part symbol'], [978, 'upsilon - hook symbol'], [8472, 'Weierstrass p'], [8465, 'imaginary part'], [9824, 'black spade suit'], [9827, 'black club suit'], [9829, 'black heart suit'], [9830, 'black diamond suit'], [9674, 'lozenge'], [9675, 'white circle'], [9679, 'black circle'], [9633, 'white square'], [9632, 'black square'], [9651, 'white up-pointing triangle'], [9650, 'black up-pointing triangle'], [9661, 'white down-pointing triangle'], [9660, 'black down-pointing triangle'], [9733, 'black star'], [9734, 'white star'], [9742, 'black telephone'], [9786, 'white smiling face'], [9792, 'female sign'], [9794, 'male sign'], [9834, 'eighth note'], [9835, 'beamed eighth notes'], [9839, 'music sharp sign'], [10003, 'check mark'], [10004, 'heavy check mark'], [10007, 'ballot x'], [10008, 'heavy ballot x'], [10038, 'six pointed black star'], [10070, 'black diamond minus white x'], [9733, 'black star'], [10047, 'black florette'], [10148, 'heavy round-tipped rightwards arrow'],
    ],
  },
  {
    name: 'Arrows',
    characters: [
      [8592, 'leftwards arrow'], [8593, 'upwards arrow'], [8594, 'rightwards arrow'], [8595, 'downwards arrow'], [8596, 'left right arrow'], [8597, 'up down arrow'], [8598, 'north west arrow'], [8599, 'north east arrow'], [8600, 'south east arrow'], [8601, 'south west arrow'], [8629, 'downwards arrow with corner leftwards'], [8656, 'leftwards double arrow'], [8657, 'upwards double arrow'], [8658, 'rightwards double arrow'], [8659, 'downwards double arrow'], [8660, 'left right double arrow'], [8661, 'up down double arrow'], [8678, 'leftwards white arrow'], [8679, 'upwards white arrow'], [8680, 'rightwards white arrow'], [8681, 'downwards white arrow'], [9650, 'black up-pointing triangle'], [9654, 'black right-pointing triangle'], [9660, 'black down-pointing triangle'], [9664, 'black left-pointing triangle'], [10132, 'heavy wide-headed rightwards arrow'], [10140, 'heavy rightwards arrow'], [10146, 'three-d top-lighted rightwards arrowhead'], [10148, 'heavy round-tipped rightwards arrow'], [10162, 'notched upper right-shadowed white rightwards arrow'],
    ],
  },
];
