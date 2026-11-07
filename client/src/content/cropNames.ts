// =============================================================================
// Crop names in Hindi and Marathi, for the /rates page
// =============================================================================
// Keyed by the commodity id the server sends (`commodity` on every rate, the
// first feed name of each row in server/src/services/mandiCommodities.ts), not
// by the English label, because labels are reworded and ids are not.
//
// A crop missing here simply shows its English name, so a new commodity from
// the feed is never hidden. Names are the ones used in the mandi itself (the
// Marathi follows Maharashtra APMC usage: कांदा, वांगी, तूर). Crops with no
// common local name (duster beans, chennangi dal and the like) are left out
// on purpose rather than given a made-up one.
// =============================================================================

type Names = { hi: string; mr: string };

const NAMES: Record<string, Names> = {
  // vegetables
  'Tomato': { hi: 'टमाटर', mr: 'टोमॅटो' },
  'Onion': { hi: 'प्याज़', mr: 'कांदा' },
  'Potato': { hi: 'आलू', mr: 'बटाटा' },
  'Brinjal': { hi: 'बैंगन', mr: 'वांगी' },
  'Cabbage': { hi: 'पत्ता गोभी', mr: 'कोबी' },
  'Cauliflower': { hi: 'फूल गोभी', mr: 'फ्लॉवर' },
  'Carrot': { hi: 'गाजर', mr: 'गाजर' },
  'Garlic': { hi: 'लहसुन', mr: 'लसूण' },
  'Beetroot': { hi: 'चुकंदर', mr: 'बीट' },
  'Pumpkin': { hi: 'कद्दू', mr: 'भोपळा' },
  'Drumstick': { hi: 'सहजन', mr: 'शेवगा' },
  'Beans': { hi: 'बीन्स', mr: 'घेवडा' },
  'Turnip': { hi: 'शलगम', mr: 'सलगम' },
  'Tinda': { hi: 'टिंडा', mr: 'ढेमसे' },
  'Yam': { hi: 'जिमीकंद', mr: 'कंद' },
  'Green Chilli': { hi: 'हरी मिर्च', mr: 'हिरवी मिरची' },
  'Ginger(Green)': { hi: 'अदरक', mr: 'आले' },
  'Bhindi(Ladies Finger)': { hi: 'भिंडी', mr: 'भेंडी' },
  'Cucumbar(Kheera)': { hi: 'खीरा', mr: 'काकडी' },
  'Capsicum': { hi: 'शिमला मिर्च', mr: 'ढोबळी मिरची' },
  'Raddish': { hi: 'मूली', mr: 'मुळा' },
  'Bitter gourd': { hi: 'करेला', mr: 'कारले' },
  'Bottle gourd': { hi: 'लौकी', mr: 'दुधी भोपळा' },
  'Ridgeguard(Tori)': { hi: 'तोरई', mr: 'दोडका' },
  'Snakeguard': { hi: 'चिचिंडा', mr: 'पडवळ' },
  'Sponge gourd': { hi: 'घिया तोरई', mr: 'घोसाळे' },
  'Ashgourd': { hi: 'पेठा', mr: 'कोहळा' },
  'Little gourd(Kundru)': { hi: 'कुंदरू', mr: 'तोंडली' },
  'Pointed gourd(Parval)': { hi: 'परवल', mr: 'परवल' },
  'Spiny Gourd / Kartali(Kantola)': { hi: 'ककोड़ा', mr: 'कर्टोली' },
  'Sweet Pumpkin': { hi: 'मीठा कद्दू', mr: 'लाल भोपळा' },
  'White Pumpkin': { hi: 'सफ़ेद कद्दू', mr: 'पांढरा भोपळा' },
  'Knool Khol': { hi: 'गांठ गोभी', mr: 'नवलकोल' },
  'Long Melon(Kakri)': { hi: 'ककड़ी', mr: 'वाळूक' },
  'Cluster beans': { hi: 'ग्वार फली', mr: 'गवार' },
  'French Beans(Frasbean)': { hi: 'फ्रेंच बीन्स', mr: 'फरसबी' },
  'Indian Beans(Seam)': { hi: 'सेम', mr: 'वाल' },
  'Surat Beans(Papadi)': { hi: 'सूरती पापड़ी', mr: 'सुरती पापडी' },
  'Cowpea(Veg)': { hi: 'लोबिया फली', mr: 'चवळीच्या शेंगा' },
  'Green Peas': { hi: 'हरी मटर', mr: 'हिरवे वाटाणे' },
  'Peas Wet': { hi: 'मटर फली', mr: 'वाटाण्याच्या शेंगा' },
  'Pegeon Pea(Arhar Fali)': { hi: 'अरहर फली', mr: 'तुरीच्या शेंगा' },
  'Gram Raw(Chholia)': { hi: 'हरा चना', mr: 'ओला हरभरा' },
  'Baby Corn': { hi: 'बेबी कॉर्न', mr: 'बेबी कॉर्न' },
  'Sweet Corn': { hi: 'स्वीट कॉर्न', mr: 'स्वीट कॉर्न' },
  'Mashrooms': { hi: 'मशरूम', mr: 'मशरूम' },
  'Colacasia': { hi: 'अरबी', mr: 'अळूचे कंद' },
  'Elephant Yam(Suran)/Amorphophallus': { hi: 'सूरन', mr: 'सुरण' },
  'Yam(Ratalu)': { hi: 'रतालू', mr: 'कोनफळ' },
  'Sweet Potato': { hi: 'शकरकंद', mr: 'रताळे' },
  'Lotus Sticks': { hi: 'कमल ककड़ी', mr: 'कमळ काकडी' },
  'Banana - Green': { hi: 'कच्चा केला', mr: 'कच्ची केळी' },
  'Papaya(Raw)': { hi: 'कच्चा पपीता', mr: 'कच्ची पपई' },
  'Other green and fresh vegetables': { hi: 'अन्य सब्ज़ियाँ', mr: 'इतर भाज्या' },

  // leafy greens & herbs
  'Spinach': { hi: 'पालक', mr: 'पालक' },
  'Amaranthus': { hi: 'चौलाई', mr: 'माठ' },
  'Coriander(Leaves)': { hi: 'हरा धनिया', mr: 'कोथिंबीर' },
  'Methi(Leaves)': { hi: 'मेथी', mr: 'मेथी' },
  'Mint(Pudina)': { hi: 'पुदीना', mr: 'पुदिना' },
  'Onion Green': { hi: 'हरा प्याज़', mr: 'कांद्याची पात' },
  'Taro (Arvi) Leaves': { hi: 'अरबी के पत्ते', mr: 'अळूची पाने' },
  'Chicory(Chikori/Kasni)': { hi: 'कासनी', mr: 'कासनी' },
  'Leafy Vegetable': { hi: 'पत्तेदार सब्ज़ियाँ', mr: 'पालेभाज्या' },
  'basil': { hi: 'तुलसी', mr: 'तुळस' },

  // fruits
  'Apple': { hi: 'सेब', mr: 'सफरचंद' },
  'Banana': { hi: 'केला', mr: 'केळी' },
  'Grapes': { hi: 'अंगूर', mr: 'द्राक्षे' },
  'Guava': { hi: 'अमरूद', mr: 'पेरू' },
  'Lemon': { hi: 'नींबू', mr: 'लिंबू' },
  'Orange': { hi: 'संतरा', mr: 'संत्री' },
  'Papaya': { hi: 'पपीता', mr: 'पपई' },
  'Pineapple': { hi: 'अनानास', mr: 'अननस' },
  'Pomegranate': { hi: 'अनार', mr: 'डाळिंब' },
  'Avocado': { hi: 'एवोकाडो', mr: 'अ‍ॅव्होकॅडो' },
  'Kinnow': { hi: 'किन्नू', mr: 'किन्नू' },
  'Litchi': { hi: 'लीची', mr: 'लिची' },
  'Plum': { hi: 'आलूबुखारा', mr: 'आलुबुखार' },
  'Mango': { hi: 'आम', mr: 'आंबा' },
  'Lime': { hi: 'कागज़ी नींबू', mr: 'कागदी लिंबू' },
  'Galgal(Lemon)': { hi: 'गलगल', mr: 'गलगल' },
  'Water Melon': { hi: 'तरबूज़', mr: 'कलिंगड' },
  'Karbuja(Musk Melon)': { hi: 'ख़रबूज़ा', mr: 'खरबूज' },
  'Mousambi(Sweet Lime)': { hi: 'मौसमी', mr: 'मोसंबी' },
  'Chikoos(Sapota)': { hi: 'चीकू', mr: 'चिकू' },
  'Custard Apple(Sharifa)': { hi: 'सीताफल', mr: 'सीताफळ' },
  'Amla(Nelli Kai)': { hi: 'आंवला', mr: 'आवळा' },
  'Jack Fruit(Ripe)': { hi: 'कटहल', mr: 'फणस' },
  'Pear(Marasebu)': { hi: 'नाशपाती', mr: 'नासपती' },
  'Fig(Anjura/Anjeer)': { hi: 'अंजीर', mr: 'अंजीर' },
  'Kiwi Fruit': { hi: 'कीवी', mr: 'किवी' },
  'Tender Coconut': { hi: 'कच्चा नारियल', mr: 'शहाळे' },

  // cereals & millets
  'Wheat': { hi: 'गेहूँ', mr: 'गहू' },
  'Maize': { hi: 'मक्का', mr: 'मका' },
  'Rice': { hi: 'चावल', mr: 'तांदूळ' },
  'Quinoa': { hi: 'क्विनोआ', mr: 'क्विनोआ' },
  'Paddy(Dhan)(Common)': { hi: 'धान', mr: 'भात' },
  'Paddy(Basmati)': { hi: 'बासमती धान', mr: 'बासमती भात' },
  'Broken Rice': { hi: 'टूटा चावल', mr: 'तुकडा तांदूळ' },
  'Beaten Rice': { hi: 'पोहा', mr: 'पोहे' },
  'Wheat Atta': { hi: 'गेहूँ का आटा', mr: 'गव्हाचे पीठ' },
  'Maida Atta': { hi: 'मैदा', mr: 'मैदा' },
  'Bajra(Pearl Millet/Cumbu)': { hi: 'बाजरा', mr: 'बाजरी' },
  'Jowar(Sorghum)': { hi: 'ज्वार', mr: 'ज्वारी' },
  'Ragi(Finger Millet)': { hi: 'रागी (मंडुआ)', mr: 'नाचणी' },
  'Barley(Jau)': { hi: 'जौ', mr: 'जव' },
  'Foxtail Millet(Navane)': { hi: 'कंगनी', mr: 'राळा' },
  'Kodo Millet(Varagu)': { hi: 'कोदो', mr: 'कोद्रा' },
  'Kutki': { hi: 'कुटकी', mr: 'कुटकी' },
  'Same/Savi': { hi: 'सांवा', mr: 'वरई' },
  'Millets': { hi: 'मोटा अनाज', mr: 'तृणधान्ये' },
  'Rajgir': { hi: 'राजगिरा', mr: 'राजगिरा' },

  // pulses
  'Bengal Gram(Gram)(Whole)': { hi: 'चना', mr: 'हरभरा' },
  'Bengal Gram Dal(Chana Dal)': { hi: 'चना दाल', mr: 'हरभरा डाळ' },
  'Kabuli Chana(Chickpeas-White)': { hi: 'काबुली चना', mr: 'काबुली चणा' },
  'Red gram/Arhar/Tur(whole)': { hi: 'अरहर (तूर)', mr: 'तूर' },
  'Red gram split/Arhar dal/Tur dal': { hi: 'अरहर दाल', mr: 'तूर डाळ' },
  'Green Gram(Moong)(Whole)': { hi: 'मूंग', mr: 'मूग' },
  'Green Gram Dal(Moong Dal)': { hi: 'मूंग दाल', mr: 'मूग डाळ' },
  'Black Gram(Urd Beans)(Whole)': { hi: 'उड़द', mr: 'उडीद' },
  'Black Gram Dal(Urd Dal)': { hi: 'उड़द दाल', mr: 'उडीद डाळ' },
  'Lentil(Masur)(Whole)': { hi: 'मसूर', mr: 'मसूर' },
  'Masur Dal': { hi: 'मसूर दाल', mr: 'मसूर डाळ' },
  'Cowpea(Lobia/Karamani)': { hi: 'लोबिया', mr: 'चवळी' },
  'Kulthi(Horse Gram)': { hi: 'कुलथी', mr: 'कुळीथ' },
  'Lak(Teora)': { hi: 'खेसारी', mr: 'लाखोळी' },
  'Mataki': { hi: 'मोठ', mr: 'मटकी' },
  'Peas(Dry)': { hi: 'सूखी मटर', mr: 'सुके वाटाणे' },
  'White Peas': { hi: 'सफ़ेद मटर', mr: 'पांढरे वाटाणे' },
  'Dal Mix': { hi: 'मिक्स दाल', mr: 'मिश्र डाळ' },
  'Other Pulses': { hi: 'अन्य दालें', mr: 'इतर कडधान्ये' },

  // oilseeds
  'Soyabean': { hi: 'सोयाबीन', mr: 'सोयाबीन' },
  'Groundnut': { hi: 'मूंगफली', mr: 'भुईमूग' },
  'Mustard': { hi: 'सरसों', mr: 'मोहरी' },
  'Linseed': { hi: 'अलसी', mr: 'जवस' },
  'Safflower': { hi: 'कुसुम', mr: 'करडई' },
  'Copra': { hi: 'खोपरा', mr: 'खोबरे' },
  'Ground Nut Seed': { hi: 'मूंगफली दाना', mr: 'शेंगदाणे' },
  'Groundnut pods(raw)': { hi: 'कच्ची मूंगफली', mr: 'भुईमुगाच्या शेंगा' },
  'Rayee': { hi: 'राई', mr: 'राई' },
  'Sesamum(Sesame,Gingelly,Til)': { hi: 'तिल', mr: 'तीळ' },
  'Castor Seed': { hi: 'अरंडी', mr: 'एरंडी' },
  'Sunflower/Sunflower Seed': { hi: 'सूरजमुखी बीज', mr: 'सूर्यफूल बी' },
  'Niger Seed(Ramtil)': { hi: 'रामतिल', mr: 'कारळे' },
  'Cotton Seed': { hi: 'बिनौला', mr: 'सरकी' },
  'gulli': { hi: 'महुआ बीज', mr: 'मोहाची बी' },

  // spices
  'Turmeric': { hi: 'हल्दी', mr: 'हळद' },
  'Cardamom': { hi: 'इलायची', mr: 'वेलची' },
  'Ajwan': { hi: 'अजवाइन', mr: 'ओवा' },
  'Turmeric(raw)': { hi: 'कच्ची हल्दी', mr: 'ओली हळद' },
  'Chili Red': { hi: 'सूखी लाल मिर्च', mr: 'सुकी लाल मिरची' },
  'Cummin Seed(Jeera)': { hi: 'जीरा', mr: 'जिरे' },
  'Corriander seed': { hi: 'धनिया', mr: 'धणे' },
  'Methi Seeds': { hi: 'मेथी दाना', mr: 'मेथी दाणे' },
  'Soanf': { hi: 'सौंफ', mr: 'बडीशेप' },
  'Black pepper': { hi: 'काली मिर्च', mr: 'काळी मिरी' },
  'Cinamon(Dalchini)': { hi: 'दालचीनी', mr: 'दालचिनी' },
  'Bay leaf(Tejpatta)': { hi: 'तेजपत्ता', mr: 'तमालपत्र' },
  'Ginger(Dry)': { hi: 'सोंठ', mr: 'सुंठ' },
  'Tamarind Fruit': { hi: 'इमली', mr: 'चिंच' },
  'nigella': { hi: 'कलौंजी', mr: 'कलोंजी' },
  'poppy seeds': { hi: 'खसखस', mr: 'खसखस' },
  'Suva(Dill Seed)': { hi: 'सोआ', mr: 'शेपू बी' },
  'Asalia': { hi: 'हालिम', mr: 'अळीव' },
  'dried mango': { hi: 'अमचूर', mr: 'आमचूर' },

  // dry fruits & nuts
  'Walnut': { hi: 'अखरोट', mr: 'अक्रोड' },
  'Almond(Badam)': { hi: 'बादाम', mr: 'बदाम' },
  'Cashewnuts': { hi: 'काजू', mr: 'काजू' },
  'Dry Grapes': { hi: 'किशमिश', mr: 'बेदाणे' },
  'Makhana(Foxnut)': { hi: 'मखाना', mr: 'मखाणा' },

  // milk & dairy
  'Milk': { hi: 'दूध', mr: 'दूध' },
  'Ghee': { hi: 'घी', mr: 'तूप' },
  'Curd': { hi: 'दही', mr: 'दही' },
  'Paneer': { hi: 'पनीर', mr: 'पनीर' },

  // other farm produce
  'Cotton': { hi: 'कपास', mr: 'कापूस' },
  'Jute': { hi: 'जूट', mr: 'ताग' },
  'Tobacco': { hi: 'तंबाकू', mr: 'तंबाखू' },
  'Coconut': { hi: 'नारियल', mr: 'नारळ' },
  'Sugar': { hi: 'चीनी', mr: 'साखर' },
  'Fish': { hi: 'मछली', mr: 'मासे' },
  'Prawn': { hi: 'झींगा', mr: 'कोळंबी' },
  'Mahua': { hi: 'महुआ', mr: 'मोह' },
  'Cocoa': { hi: 'कोको', mr: 'कोको' },
  'Arecanut(Betelnut/Supari)': { hi: 'सुपारी', mr: 'सुपारी' },
  'Betal Leaves': { hi: 'पान', mr: 'विड्याची पाने' },
  'Gur(Jaggery)': { hi: 'गुड़', mr: 'गूळ' },
  'Khandsari(Desi Khand)': { hi: 'खांडसारी', mr: 'खांडसरी' },
  'Rab/Liquid Jaggery/Molasses': { hi: 'राब', mr: 'काकवी' },
  'Sabu Dan': { hi: 'साबूदाना', mr: 'साबुदाणा' },
  'Guar Seed(Cluster Beans Seed)': { hi: 'ग्वार बीज', mr: 'गवार बी' },
  'Isabgul(Psyllium)': { hi: 'ईसबगोल', mr: 'इसबगोल' },
  'Chiaseeds': { hi: 'चिया बीज', mr: 'चिया बिया' },
  'Muskmelon Seeds': { hi: 'ख़रबूज़े के बीज', mr: 'खरबूज बी' },
  'Neem Seed': { hi: 'नीम बीज', mr: 'कडुनिंबाची बी' },
  'Coconut Oil': { hi: 'नारियल तेल', mr: 'खोबरेल तेल' },
  'Mustard Oil': { hi: 'सरसों तेल', mr: 'मोहरीचे तेल' },
  'Mentha Oil': { hi: 'मेंथा तेल', mr: 'मेंथा तेल' },
  'Asgand': { hi: 'अश्वगंधा', mr: 'अश्वगंधा' },
  'Absinthe': { hi: 'चिरायता', mr: 'किराईत' },
  'Mahedi': { hi: 'मेहंदी', mr: 'मेंदी' },
};

const BY_ID = new Map(Object.entries(NAMES).map(([id, n]) => [id.toLowerCase(), n]));

/**
 * The crop's name in the reader's language, or null when the page is in
 * English or this crop has no local name on file (show the English label).
 */
export function localCropName(commodity: string, lang: string): string | null {
  const code = lang.slice(0, 2);
  if (code !== 'hi' && code !== 'mr') return null;
  return BY_ID.get(commodity.toLowerCase())?.[code] ?? null;
}
