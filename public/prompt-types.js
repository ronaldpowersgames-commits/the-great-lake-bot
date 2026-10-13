(function(root) {
  const types = [
    {name:'Social', icon:'🤝'},
    {name:'Still Waters', icon:'🌊'},
    {name:'Internal', icon:'⚙️'},
    {name:'Podcast Style', icon:'🎙️'},
    {name:'Parent', icon:'👪', prompts:[
      ['💬','Find the Words','Help me find age-appropriate words for a conversation with my child. Offer a useful starting line and ask one question about their age or what happened.'],
      ['🧭','Behavior Read','Help me understand a parenting situation without labeling my child or assuming hidden motives. Ask about their age and relevant context one detail at a time.'],
      ['🤝','Repair & Connect','Help me reconnect with my child after a difficult moment. Offer a small repair step while exploring what happened without blame.'],
      ['🛡️','Kind Boundaries','Help me set a clear, kind, age-appropriate boundary with my child. Explore the situation conversationally and suggest practical wording.'],
      ['🔄','Routine Reset','Help me workshop a realistic family routine. Give a small starting idea and ask which part of our day is hardest.'],
      ['🌱','Parent Check-In','Help me reflect on how I am showing up as a parent. Start gently with one concrete moment, not a parenting questionnaire.']
    ]},
    {name:'Learn', icon:'📚', prompts:[
      ['📝','Quiz Maker','Help me make a quiz from my study material or topic. Ask what I am studying, then adapt questions to my level. Keep answers separate until I try; explain feedback and do not invent source facts.'],
      ['🗂️','Flashcard Maker','Make concise question-and-answer flashcards from my study material. Ask for the material or topic if missing. Cover key concepts and common confusions, and provide a copyable front/back format.'],
      ['💡','Explain Simply','Help me understand a concept with a clear explanation and a concrete example. Ask what I am learning, then check one point of understanding at a time.'],
      ['🗣️','Teach It Back','Help me learn by teaching a concept back to you. Ask for the topic, let me explain, and give specific feedback without doing all the thinking for me.'],
      ['🧩','Practice Coach','Coach me through practice problems on my topic. Ask for the topic or problem, offer one useful hint at a time, and let me attempt it before revealing the solution.'],
      ['🗓️','Study Plan','Help me build a realistic study plan. Ask first what I am preparing for, then refine a useful starter plan around my time and current understanding.']
    ]},
    {name:'Hypnotist', icon:'🌀', prompts:[
      ['📜','Script Maker','Help me write a voluntary hypnosis or guided-relaxation script. First clarify the intended audience and goal one question at a time. Include explicit choice to stop, comfortable pacing and a clear return to ordinary alertness. Do not make medical promises.'],
      ['📖','Story Script','Help me create a metaphor-based hypnosis story for a consenting listener. Clarify the goal and audience, then workshop imagery and a gentle ending without covert influence or claims of hidden truth.'],
      ['🎓','Teacher','Teach me how hypnosis scripts work, distinguishing evidence from metaphor and NLP claims. Start with what I want to learn, explain one technique with an example, and check understanding naturally.'],
      ['🧭','When & Why','Help me understand when and why someone might choose voluntary hypnosis, its limitations and when professional support is more appropriate. Ask what use I have in mind without promising outcomes.'],
      ['🔍','Script Review','Help me review a hypnosis script for clarity, pacing, consent, unsupported claims and a safe ending. Ask me to share the script and intended use; explain suggested edits.'],
      ['🌿','Self-Hypnosis','Help me design a brief, optional self-hypnosis or guided-relaxation exercise for a nonclinical goal. Ask my goal first. Include a stop option, a safe stationary setting and a clear return to alertness.']
    ]}
  ];
  const more = [
    [
      ['👋','Reconnect','Help me send a natural message to reconnect with someone. Use any relevant context I have shared and ask one useful question while offering a starter line.'],
      ['🛡️','Set a Boundary','Help me express a social boundary clearly without unnecessary harshness. Offer provisional wording and ask what I need to protect.'],
      ['🤝','Repair a Moment','Help me repair an awkward or hurtful interaction. Separate what happened from assumptions and workshop a sincere next message.'],
      ['🎭','Tone Options','Give me three short tone options for my message: warm, playful and direct. Ask me for the message or situation if needed.'],
      ['🧩','Mixed Signals','Help me interpret mixed signals using actual messages and my context. Offer plausible alternatives and a respectful way to test the strongest interpretation.']
    ],
    [
      ['🔍','Subtext Check','Help me understand the possible hidden subtext in an interaction. Combine source evidence with my context, rank plausible readings and ask one question that could distinguish them.'],
      ['🧭','Meeting Currents','Help me examine patterns across meetings. Use only supplied exact passages or ask me to use Meeting Currents for archive retrieval. Keep dates, participants and coverage clear.'],
      ['⚖️','Other Readings','Help me test my interpretation of a situation against credible alternatives. Ask what happened, then identify evidence that would change the reading.'],
      ['📍','Decision Point','Help me clarify the decision this situation actually calls for. Offer a tentative framing and ask one question about what matters most.'],
      ['🔮','Likely Next Moves','Help me anticipate likely reactions or next moves in this situation. Ground conditional predictions in evidence and context, not mind-reading or invented probabilities.']
    ],
    [
      ['🪞','Pattern Check','Help me examine a recurring pattern in my choices. Start from a real example and test interpretations without defining who I am for me.'],
      ['⚖️','Values & Trade-Offs','Help me clarify the values and trade-offs behind a decision. Offer a useful distinction and ask one question that reveals my own criteria.'],
      ['🎯','One Small Move','Help me turn a vague intention into one manageable next action. Ask what feels stuck and offer a provisional starting step.'],
      ['🧠','Assumption Test','Help me test an assumption I am making. Ask what I believe, then explore evidence and an alternative without steering me toward a predetermined answer.'],
      ['🌙','Evening Reflection','Help me reflect briefly on my day: what mattered, what I learned and what I might carry forward. Ask one natural question at a time.']
    ],
    [
      ['🎤','Guest Prep','Help me prepare for a podcast-style conversation with a guest. Ask who they are, then workshop a grounded opening angle using available context.'],
      ['🧵','Episode Arc','Help me shape a natural conversation arc around a topic or guest. Offer a starter sequence and refine it around the audience and purpose.'],
      ['👂','Listen & Probe','Help me choose a thoughtful follow-up from what someone actually said. Ask for the exchange and identify one detail worth exploring.'],
      ['⚡','Respectful Challenge','Help me ask a sharp but fair interview question that tests an idea without ambushing or humiliating the guest.'],
      ['🏁','Strong Closing','Help me close a podcast-style conversation with a meaningful final question and a concise takeaway grounded in what was discussed.']
    ],
    [
      ['👂','Listen First','Help me listen to my child without rushing to fix things. Ask for their age or the moment, then offer a validating response and one gentle question.'],
      ['🎲','Play & Connect','Suggest an age-appropriate, low-pressure way to connect with my child through play or shared time. Ask one relevant context question.'],
      ['🏫','School Conversation','Help me prepare for a constructive conversation about my child with their school. Separate observations from assumptions and clarify the desired outcome.'],
      ['🤝','Co-Parent Talk','Help me word a respectful co-parenting message focused on the child. Offer useful wording while clarifying the practical issue.'],
      ['🌱','Build Independence','Help me support age-appropriate independence without withdrawing support. Ask about my child and the skill or situation we are working on.']
    ],
    [
      ['🔁','Recall Round','Run a short active-recall round from my study material. Ask one question at a time, wait for my attempt and explain corrections using the source.'],
      ['🔍','Find the Gap','Help me identify a gap in my understanding with a short diagnostic question, then explain the missing concept and let me retry.'],
      ['⚖️','Compare Concepts','Help me distinguish two easily confused concepts with examples and a quick check. Ask which concepts I am comparing.'],
      ['🗓️','Review Schedule','Help me plan spaced review of my study material around a realistic schedule. Ask for my goal or deadline and adapt as we talk.'],
      ['🏁','Exam Practice','Create an exam-style practice round based on my subject, level and supplied material. Keep solutions separate until I attempt the questions.']
    ],
    [
      ['🎵','Pacing Workshop','Help me workshop the pacing, pauses and transitions of a voluntary hypnosis script. Ask for the script or audience and explain the purpose of edits without overstating evidence.'],
      ['🗝️','Consent Language','Help me write clear, natural consent and stop-option wording for a hypnosis session. Preserve the listener ability to decline or stop without pressure.'],
      ['🌄','Imagery Builder','Help me create optional sensory imagery for a consenting listener. Ask their preferences; do not assume everyone visualizes or finds the same imagery comfortable.'],
      ['⚖️','Evidence Check','Help me critically evaluate a claim about hypnosis or NLP. Ask for the claim and distinguish established evidence, uncertainty and unsupported marketing; never invent citations.'],
      ['🔔','Return & Debrief','Help me write a clear return-to-alertness and optional debrief for a voluntary hypnosis script, without claiming a guaranteed effect or interpreting memories as facts.']
    ]
  ];
  types.forEach((type,index)=>{
    type.more=[...more[index],['💡','Use This Type',`Show me how to use Type: ${type.name} and the Lake tool most effectively. Explain its quick prompts with a concrete example, what material and context I can supply, how to refine the conversation, and relevant limits. Explain that Types choose starting prompts, moods change response style, and neither resets this chat. Keep it practical and ask one optional question about my goal.`]];
  });
  if(typeof module!=='undefined' && module.exports)module.exports=types;
  else root.LakePromptTypes=types;
})(typeof window==='undefined'?globalThis:window);
