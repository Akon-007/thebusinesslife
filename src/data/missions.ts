import type { Mission } from '../types/mission'

/**
 * Missions for the 15 Beginner levels. Objective ids are unique per level so
 * progress never bleeds between levels, even when the same interaction is reused.
 *
 * FROZEN CONTRACT: these objectives define how the player physically advances
 * through the city. The mission engine reads them; it never invents new ones.
 */
export const MISSIONS: Mission[] = [
  {
    levelId: 'L1',
    title: 'The Idea',
    briefing:
      'You have an idea burning a hole in your pocket. Before you spend a naira on it, go and find a mentor at the business hub in Victoria Island and let them kick it around.',
    objectives: [
      { id: 'L1.o1', text: 'Visit the Idera Business Hub', type: 'visit_building', target: 'business_hub', count: 1, hintLocation: 'Victoria Island Business District' },
      { id: 'L1.o2', text: 'Speak with a mentor', type: 'talk_role', target: 'mentor', count: 1 },
      { id: 'L1.o3', text: 'Collect mentorship advice', type: 'collect_info', target: 'mentorship_advice', count: 1 },
      { id: 'L1.o4', text: 'Write down your business idea', type: 'business_action', target: 'write_business_idea', count: 1, hint: 'Open the Business panel' },
      { id: 'L1.o5', text: 'Define the problem you are solving', type: 'business_action', target: 'define_problem', count: 1, hint: 'Open the Business panel after writing the idea' },
    ],
  },
  {
    levelId: 'L2',
    title: 'Market Discovery',
    briefing:
      'Do not build for yourself. Get into Balogun Market and find three real potential customers. Ask about their needs, not about your product.',
    objectives: [
      { id: 'L2.o1', text: 'Visit Balogun Market', type: 'visit_building', target: 'market', count: 1, hintLocation: 'Balogun Market' },
      { id: 'L2.o2', text: 'Find 3 potential customers in the market', type: 'collect_info', target: 'customer_need', count: 3, hint: 'Click customers and interview them' },
      { id: 'L2.o3', text: 'Identify a target market', type: 'business_action', target: 'define_target_market', count: 1, hint: 'Open the Business panel' },
    ],
  },
  {
    levelId: 'L3',
    title: 'Business Planning',
    briefing:
      'A plan without numbers is a wish. Compare what the market charges, then put your plan on paper.',
    objectives: [
      { id: 'L3.o1', text: 'Compare 2 market prices with traders', type: 'collect_info', target: 'market_price', count: 2, hintLocation: 'Balogun Market' },
      { id: 'L3.o2', text: 'Record your pricing benchmark', type: 'business_action', target: 'compare_market_prices', count: 1, hint: 'Open the Business panel' },
      { id: 'L3.o3', text: 'Write your business plan', type: 'business_action', target: 'write_business_plan', count: 1, hint: 'Open the Business panel' },
    ],
  },
  {
    levelId: 'L4',
    title: 'Company Formation',
    briefing:
      'An idea is not a company. Head to the Corporate Affairs registry, speak to the official on the desk, and register the name.',
    objectives: [
      { id: 'L4.o1', text: 'Visit the Corporate Affairs registry', type: 'visit_building', target: 'registration_office', count: 1, hintLocation: 'Civic Centre' },
      { id: 'L4.o2', text: 'Speak with a government official', type: 'talk_role', target: 'gov_official', count: 1 },
      { id: 'L4.o3', text: 'Register your company', type: 'business_action', target: 'register_company', count: 1, hint: 'Use the Registry interaction' },
    ],
  },
  {
    levelId: 'L5',
    title: 'Meet the Requirements',
    briefing:
      'Registration comes with conditions. Collect every requirement they hand you and close them out.',
    objectives: [
      { id: 'L5.o1', text: 'Collect 3 regulatory requirements', type: 'collect_info', target: 'requirement_info', count: 3, hintLocation: 'Civic Centre' },
      { id: 'L5.o2', text: 'Complete your registration', type: 'business_action', target: 'complete_registration', count: 1 },
    ],
  },
  {
    levelId: 'L6',
    title: 'Open for Business',
    briefing:
      'You need a front door. Find premises in a commercial area and open up.',
    objectives: [
      { id: 'L6.o1', text: 'Secure a trading premises', type: 'business_action', target: 'lease_premises', count: 1, hintLocation: 'Broad Street Commercial' },
      { id: 'L6.o2', text: 'Open the business', type: 'business_action', target: 'open_business', count: 1 },
    ],
  },
  {
    levelId: 'L7',
    title: 'Build Your Founding Team',
    briefing:
      'You cannot run this alone. Find people around the city, review what they bring, and hire a founding team.',
    objectives: [
      { id: 'L7.o1', text: 'Review 3 candidates', type: 'collect_info', target: 'candidate_profile', count: 3, hint: 'Talk to employees around the city' },
      { id: 'L7.o2', text: 'Hire your founding team', type: 'business_action', target: 'hire_team', count: 1 },
    ],
  },
  {
    levelId: 'L8',
    title: 'Find Your First Capital',
    briefing:
      'Banks do not lend to dreams. Learn the terms before you ask for money.',
    objectives: [
      { id: 'L8.o1', text: 'Discuss loan terms with a bank representative', type: 'talk_role', target: 'bank_rep', count: 1, hintLocation: 'Marina Capital Bank' },
      { id: 'L8.o2', text: 'Collect 2 sets of funding terms', type: 'collect_info', target: 'funding_terms', count: 2 },
      { id: 'L8.o3', text: 'Open a business account', type: 'business_action', target: 'open_bank_account', count: 1 },
    ],
  },
  {
    levelId: 'L9',
    title: 'Prepare to Pitch',
    briefing:
      'Investors will ask about your competition before they ask about you. Know the field, then build the deck.',
    objectives: [
      { id: 'L9.o1', text: 'Research 2 competitors', type: 'collect_info', target: 'competitor_info', count: 2, hint: 'Business owners and competitors know the field' },
      { id: 'L9.o2', text: 'Build your pitch deck', type: 'business_action', target: 'build_pitch_deck', count: 1, hint: 'Open the Business panel' },
    ],
  },
  {
    levelId: 'L10',
    title: 'Enter the Investment Market',
    briefing:
      'Money is in the business district. Introduce yourself to the investors and find out who is actually interested.',
    objectives: [
      { id: 'L10.o1', text: 'Visit the business hub', type: 'visit_building', target: 'business_hub', count: 1, hintLocation: 'Victoria Island Business District' },
      { id: 'L10.o2', text: 'Meet 3 investors', type: 'talk_role', target: 'investor', count: 3 },
      { id: 'L10.o3', text: 'Gauge investment interest', type: 'collect_info', target: 'investment_interest', count: 3 },
    ],
  },
  {
    levelId: 'L11',
    title: 'Handle Your First Rejection',
    briefing:
      'You will be told no. It is part of the job. Pitch again, and actually read the feedback.',
    objectives: [
      { id: 'L11.o1', text: 'Pitch to investors (twice)', type: 'do_interaction', target: 'pitch', count: 2 },
      { id: 'L11.o2', text: 'Review the rejection feedback', type: 'business_action', target: 'review_rejection', count: 1 },
    ],
  },
  {
    levelId: 'L12',
    title: 'Secure Pre-seed Investment',
    briefing:
      'One of them believes in you. Go back, pitch it properly, and close the round.',
    objectives: [
      { id: 'L12.o1', text: 'Deliver a successful pitch', type: 'do_interaction', target: 'pitch', count: 1 },
      { id: 'L12.o2', text: 'Close your pre-seed round', type: 'business_action', target: 'secure_preseed', count: 1 },
    ],
  },
  {
    levelId: 'L13',
    title: 'Prepare for Launch',
    briefing:
      'Before the doors open, the shelves must be full. Negotiate with suppliers and stock up.',
    objectives: [
      { id: 'L13.o1', text: 'Negotiate 2 supplier quotes', type: 'collect_info', target: 'supplier_quote', count: 2, hintLocation: 'Apapa Industrial Area' },
      { id: 'L13.o2', text: 'Stock your inventory', type: 'business_action', target: 'stock_inventory', count: 1 },
    ],
  },
  {
    levelId: 'L14',
    title: 'First Board & Business Review',
    briefing:
      'Your investors now have a seat at the table. Get your accountant in and hold the first board meeting.',
    objectives: [
      { id: 'L14.o1', text: 'Consult a lawyer or accountant', type: 'talk_role', target: 'lawyer_accountant', count: 1 },
      { id: 'L14.o2', text: 'Hold your first board meeting', type: 'business_action', target: 'hold_board_meeting', count: 1 },
      { id: 'L14.o3', text: 'Build your reputation to 20', type: 'reach_stat', target: 'reputation', count: 20 },
    ],
  },
  {
    levelId: 'L15',
    title: 'Launch & Break-even',
    briefing:
      'This is it. Launch the product and earn back every naira you have put in.',
    objectives: [
      { id: 'L15.o1', text: 'Launch the product', type: 'business_action', target: 'launch_product', count: 1 },
      { id: 'L15.o2', text: 'Reach ₦2,000,000 in cash', type: 'reach_stat', target: 'cash', count: 2000000 },
      { id: 'L15.o3', text: 'Have 3 people on your team', type: 'reach_stat', target: 'team', count: 3 },
    ],
  },
]

export const MISSION_BY_LEVEL = Object.fromEntries(MISSIONS.map((m) => [m.levelId, m])) as Record<
  string,
  Mission
>
