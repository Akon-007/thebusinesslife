import type { NPCRole, PersonalityTrait } from '../types/npc'

/** Ambient greetings by role, used when the player approaches an NPC. */
export const GREETINGS: Record<NPCRole, string[]> = {
  customer: ['"Good afternoon. You dey sell something?"', '"Oga, how you dey?"', '"Are you the new shop?"'],
  market_trader: ['"Customer! Come and see what I have today."', '"Wetin you need? I get am."'],
  supplier: ['"You came to the right place. What quantity?"', '"Talk to me. What do you need?"'],
  business_owner: ['"So you are the new business on the street."', '"How far? Business moving?"'],
  employee: ['"Good day. Are you hiring?"', '"I have been looking for work, sir."'],
  mentor: ['"Sit down. Tell me what you are building."', '"You look like someone with a problem to solve."'],
  competitor: ['"I have seen you around. Watching you."', '"Business is business, no hard feelings."'],
  bank_rep: ['"Welcome. Do you have an appointment?"', '"Are you here for the SME desk?"'],
  investor: ['"You have thirty seconds. Go."', '"What are you building, and why now?"'],
  gov_official: ['"Next! What is your business here?"', '"Do you have your documents?"'],
  lawyer_accountant: ['"Come in. What is the matter?"', '"Is this about compliance or the books?"'],
  delivery: ['"Where is the load going?"', '"I can move it today if the price is right."'],
  service_provider: ['"You need signage? Branding? Talk to me."', '"What does your business need?"'],
  resident: ['"Good evening. You are new here, abi?"', '"How is the family?"'],
}

/** Personality changes how an NPC carries themselves. */
export const PERSONALITY_MODIFIERS: Record<PersonalityTrait, string> = {
  friendly: 'warm and open',
  aggressive: 'blunt and impatient',
  shrewd: 'sharp and calculating',
  curious: 'full of questions',
  reserved: 'quiet and guarded',
  generous: 'ready to help',
  skeptical: 'hard to convince',
  ambitious: 'always looking for the next level',
}

/** Speed and idle-time multipliers by personality, used by the NPC brain. */
export const PERSONALITY_BEHAVIOUR: Record<
  PersonalityTrait,
  { speed: number; idleBias: number; sociability: number }
> = {
  friendly: { speed: 1.0, idleBias: 0.9, sociability: 1.0 },
  aggressive: { speed: 1.35, idleBias: 0.6, sociability: 0.6 },
  shrewd: { speed: 1.1, idleBias: 0.9, sociability: 0.8 },
  curious: { speed: 1.15, idleBias: 0.7, sociability: 1.2 },
  reserved: { speed: 0.85, idleBias: 1.2, sociability: 0.5 },
  generous: { speed: 0.95, idleBias: 1.1, sociability: 1.1 },
  skeptical: { speed: 0.9, idleBias: 1.1, sociability: 0.7 },
  ambitious: { speed: 1.3, idleBias: 0.7, sociability: 1.0 },
}

/** Investor pitch outcomes, picked by reputation band. */
export const PITCH_OUTCOMES = {
  rejected: [
    '"I am going to pass. The numbers are not there yet. Come back when they are."',
    '"Too early. You have no traction. Sorry."',
    '"I do not invest in ideas, I invest in execution. Not yet."',
  ],
  lukewarm: [
    '"Interesting, but I am not convinced. Fix your unit economics and call me."',
    '"Maybe. Send me your deck and I will look at it properly."',
  ],
  interested: [
    '"You handled that well. I want to see your diligence pack."',
    '"I like the market. Let us talk about a pre-seed round."',
  ],
  committed: [
    '"I am in. Pre-seed, and I will bring one other investor with me."',
    '"Congratulations. Term sheet by Friday."',
  ],
}

/** Building interaction prompts, keyed by building type. */
export const BUILDING_PROMPTS: Record<string, { title: string; body: string }> = {
  office: {
    title: 'Office Building',
    body: 'A working office block. Professionals come and go all day.',
  },
  bank: {
    title: 'Bank',
    body: 'Business accounts, SME loans and funding terms are handled at this desk.',
  },
  registration_office: {
    title: 'Registration Office',
    body: 'Company registration, permits and compliance are processed here.',
  },
  market: {
    title: 'Market',
    body: 'Traders, customers and suppliers. The fastest place to learn real prices.',
  },
  mall: {
    title: 'Shopping Centre',
    body: 'Retail space and high-footfall customers under one roof.',
  },
  restaurant: {
    title: 'Restaurant',
    body: 'Where deals get discussed over lunch.',
  },
  warehouse: {
    title: 'Warehouse',
    body: 'Bulk stock, logistics and supplier pricing live here.',
  },
  residential: {
    title: 'Residential Estate',
    body: 'Where your customers actually live.',
  },
  business_hub: {
    title: 'Business Hub',
    body: 'Mentors, investors and founders share this space.',
  },
}
