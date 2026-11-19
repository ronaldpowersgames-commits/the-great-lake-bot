(function (root, build) {
  const options = build();
  if (typeof module === 'object' && module.exports) module.exports = options;
  else root.LakeAudioPronunciation = options;
})(globalThis, function () {
  const english = 'Take a breath. What’s on your mind today?';
  return {
    auto: ['Auto · follow the text', english],
    'en-US': ['English · United States', english],
    'en-GB': ['English · United Kingdom', english],
    'en-AU': ['English · Australia', english],
    'en-CA': ['English · Canada', english],
    'en-IE': ['English · Ireland', english],
    'en-IN': ['English · India', english],
    'es-ES': ['Spanish · Spain', 'Respira hondo. ¿En qué estás pensando hoy?'],
    'es-MX': ['Spanish · Mexico', 'Respira hondo. ¿En qué estás pensando hoy?'],
    'pt-BR': ['Portuguese · Brazil', 'Respire fundo. O que está passando pela sua cabeça hoje?'],
    'pt-PT': ['Portuguese · Portugal', 'Respira fundo. Em que estás a pensar hoje?'],
    'fr-FR': ['French · France', 'Respire un grand coup. À quoi penses-tu aujourd’hui ?'],
    'fr-CA': ['French · Canada', 'Respire un grand coup. À quoi tu penses aujourd’hui ?'],
    'de-DE': ['German · Germany', 'Atme tief durch. Was beschäftigt dich heute?'],
    'it-IT': ['Italian · Italy', 'Fai un bel respiro. A cosa stai pensando oggi?'],
    'nl-NL': ['Dutch · Netherlands', 'Haal diep adem. Waar denk je vandaag aan?'],
    'pl-PL': ['Polish · Poland', 'Weź głęboki oddech. O czym dziś myślisz?'],
    'ru-RU': ['Russian · Russia', 'Сделай глубокий вдох. О чём ты сегодня думаешь?'],
    'uk-UA': ['Ukrainian · Ukraine', 'Зроби глибокий вдих. Про що ти сьогодні думаєш?'],
    'hi-IN': ['Hindi · India', 'एक गहरी साँस लो। आज तुम्हारे मन में क्या है?'],
    'ja-JP': ['Japanese · Japan', '深呼吸して。今日はどんなことを考えていますか？'],
    'ko-KR': ['Korean · South Korea', '숨을 깊게 쉬어요. 오늘은 무슨 생각을 하고 있나요?'],
    'id-ID': ['Indonesian · Indonesia', 'Tarik napas dalam-dalam. Apa yang kamu pikirkan hari ini?'],
    'zh-CN': ['Mandarin Chinese · mainland China', '深呼吸一下。你今天在想些什么？']
  };
});
