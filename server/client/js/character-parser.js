dungeon.ParseCharacter = (function() {
  
  function parseCharacter_(xmlContent) {
    var parser=new DOMParser();
    var xmlDoc = parser.parseFromString(xmlContent,"text/xml");
    // Relevant sections in the D&D character sheet.
    var characterSheet = xmlDoc.getElementsByTagName('CharacterSheet')[0];
    var details = characterSheet.getElementsByTagName('Details')[0];
    var ruleSet = xmlDoc.getElementsByTagName('RulesElementTally')[0];
    // Set of rules that apply to the character
    var rules = ruleSet.getElementsByTagName('RulesElement');

    var json = {
       name: extractBasicAttribute_(details, 'name'),
       player: extractBasicAttribute_(details, 'Player'),
       level: Number(extractBasicAttribute_(details, 'Level')),
       charClass: extractRulesByType_(rules, 'Class')[0],
    };
    return json;
  }

  function extractBasicAttribute_(el, tag) {
    var matches = el.getElementsByTagName(tag);
    if (matches && matches.length == 1)
      return matches[0].textContent;
  }

  function extractRulesByType_(rules, targetType) {
    var results = [];
    for (var i = 0; i < rules.length; i++) {
       var r = rules[i];
       var type = r.getAttribute('type');
       if (type == targetType) {
         results.push(r.getAttribute('name'));
       }
    }
    return results;
  }
 
  return parseCharacter_;

})();


