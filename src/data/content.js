import mercuryImage from '../components/Images/mercury.jpeg';
import sunswiftImage from '../components/Images/sunswift.png';
import EYImage from '../components/Images/EY.png';
import LadderImage from '../components/Images/Ladder.svg';
import BootinkImage from '../components/Images/bootink-logo.png';

export const profile = {
  name: 'Gabriel Esquivel',
  title: 'Co-founder @ Bootink',
  location: 'Sydney',
};

export const about = [
  'I am a Backend Software Engineer based in Sydney with a unique blend of enterprise and startup experience.',
  'My background spans from navigating complex Data & AI consulting projects at EY to driving product development as a Lead Software Engineer at Ladder.inc. This allows me to blend the rigor and structure of enterprise engineering with the agility and ownership required in startup environments.',
];

// `face` matches each logo's own background so the logo sits flush on its billboard.
// `start` is the year painted on the sidewalk; `years` is the brass plate by the door.
// `look` picks the tower's architecture on Career Ave; `lights` (0–1) overrides how many windows are lit.
export const experience = [
  { id: 'bootink', company: 'Bootink', role: 'Co-founder', image: BootinkImage, color: '#ff9a4f', face: '#040707', look: 'ink', lights: 1, start: '2026', years: '2026 – NOW', current: true },
  { id: 'ladder', company: 'Ladder', role: 'Lead Software Engineer', image: LadderImage, color: '#ff4fd8', face: '#0b0b10', look: 'ladder', lights: 0, start: '2025', years: '2025' },
  { id: 'ey', company: 'EY', role: 'AI & Data Technology Consultant Vacationer', image: EYImage, color: '#ffe14f', face: '#ffffff', look: 'glass', start: '2024', years: '2024 – 2025' },
  { id: 'sunswift', company: 'Sunswift', role: 'Embedded Systems Software Engineer', image: sunswiftImage, color: '#4fe3ff', face: '#3e3e40', look: 'solar', start: '2024', years: '2024' },
  { id: 'mercury', company: 'Mercury', role: 'Intern Mechatronic Engineer', image: mercuryImage, color: '#8dff6b', face: '#ffffff', look: 'workshop', start: '2022', years: '2022 – 2024' },
];

// The About Me building is a movie theater; these are its signs.
export const theater = {
  blade: 'GABRIEL',
  // the letterboard rotates through these
  marquee: [
    { small: 'NOW SHOWING', big: 'THE GABRIEL STORY', sub: 'FILMED ON LOCATION IN SYDNEY' },
    { small: 'STARRING', big: 'BACKEND · DATA & AI', sub: 'AND INTRODUCING BOOTINK' },
    { small: 'NOW RATED', big: 'SHIP IT', sub: 'SUITABLE FOR ALL AUDIENCES' },
    { small: 'COMING SOON', big: 'PART III', sub: 'STAY TUNED' },
  ],
  posters: [
    {
      part: 'PART I',
      title: 'ENTERPRISE',
      tagline: 'Rigor at scale.',
      credits: 'DATA & AI @ EY · DIRECTED BY CURIOSITY',
      rating: 'E',
      years: '2022 – 2025',
      art: 'skyline',
      color: '#4fe3ff',
    },
    {
      part: 'PART II',
      title: 'STARTUP',
      tagline: 'Move fast. Own it.',
      credits: 'LADDER · BOOTINK · NO STUNT DOUBLES',
      rating: 'S',
      years: '2025 – NOW',
      art: 'rocket',
      color: '#ff4fd8',
    },
  ],
};

export const skills = [
  { category: 'Languages', short: 'CODE', color: '#ff4fd8', items: ['Python', 'TypeScript', 'C', 'C++', 'Rust', 'Java', 'JavaScript', 'Assembly', 'Matlab'] },
  { category: 'Frontend', short: 'WEB', color: '#4fe3ff', items: ['React', 'Vue', 'Nuxt', 'Svelte', 'HTML', 'CSS'] },
  { category: 'Backend & Frameworks', short: 'API', color: '#ffe14f', items: ['Express', 'Flask', 'Node.js', 'Django', 'npm'] },
  { category: 'AI & Machine Learning', short: 'AIML', color: '#8dff6b', items: ['PyTorch', 'Keras', 'OpenCV'] },
  { category: 'Cloud & DevOps', short: 'CLOUD', color: '#ff9a4f', items: ['AWS', 'Azure', 'Google Cloud', 'Docker', 'Git', 'WatsonX'] },
];

export const contact = [
  { label: 'Email', value: 'gabrielpawluesquivel@gmail.com', href: 'mailto:gabrielpawluesquivel@gmail.com' },
  { label: 'LinkedIn', value: 'gabriel-esquivel-9a65a4209', href: 'https://www.linkedin.com/in/gabriel-esquivel-9a65a4209' },
  { label: 'GitHub', value: 'gabrielpesquivel', href: 'https://github.com/gabrielpesquivel' },
  { label: 'Leetcode', value: 'gabidonprime', href: 'https://leetcode.com/gabidonprime' },
];

export const blogPosts = [
  {
    id: 3,
    title: 'Blog Post 3: Reflecting on a Summer at EY',
    date: 'January 25, 2025',
    content: 'Suffice to say that my short tenure at EY has been the most rewarding and eye-opening experience I have had to date. ' +
    'To begin with, the people that I met whilst working there were really great for a wide range of reasons. My fellow interns were ' +
    'friendly, inspiring, and a pleasure to be around. The consultants a little older than I were extremely welcoming and hard-working. ' +
    'The management team were extremely capable and always pushing me to work harder and step outside of my comfort zone. \n\n Whilst there, ' +
    'I can confidently say that I am proud of the contributions I made to real client-facing projects. I did not really expect to have ' +
    'a meaningful impact as just an intern; however, my project director, Gaurav, provided an environment to push myself and do my best. ' +
    'I really am thankful to him for his time and mentorship. \n\n Beyond this, I found the beautiful building on George Street very inspiring to ' +
    'turn up to every day, and the day-to-day tasks enjoyable. This meaning in my day-to-day work is something I highly value in my future career.\n\n ' +
    'Who knows where my graduate role will be in the end, but I am very grateful for the experience I have had at EY over the past summer ' +
    'and look forward to what other experiences the near future holds. \n\n Gabriel'
  },
  {
    id: 2,
    title: 'Blog Post 2: The Start of my Personal Finance Journey',
    date: 'July 23, 2024',
    content: 'It\'s no secret that the personal finances of a student are usually not in the best shape they could be in. Mine are no exception. It\'s not for a lack ' +
    'of knowledge or resources, but more so that I viewed my dollar as best serving me now whilst I am studying rather than in the future. ' +
    'I was of the thought process that sacrificing my current experiences (going out with friends, eating well, travelling) would not be worth ' +
    'the few thousand dollars I would eventually save. In many ways, I still believe this to be true, as $1000 right now means a whole lot more to me ' +
    'in my youth than it will in a few years\' time when I am earning a full-time salary. \n\n ' +
    'Upon reflecting on this, I thought back to a lecturer I had in my second year of university when doing a software engineering course. A few times he mentioned ' +
    'a company he had co-founded called Pearler and how it was an accessible way to enter into the stock market. I investigated further, ' +
    'signing up for an account and brushing up on my knowledge of ETFs, stocks, and bonds. What really caught my attention was a tool they called ' +
    'micro-investing, which allowed me to invest any small sum of money I had into a diversified portfolio. \n\n This was a game changer for me. ' +
    'I came to the realisation that I could in fact leverage compound interest and the time I had on my side without removing all the social experiences I enjoyed. ' +
    'I would be able to get the ball rolling on my personal finance journey without having to make any significant sacrifices.\n\n This is all very exciting to me, and ' +
    'I very much look forward to having more pride in my current financial situation. \n\n Beyond this revelation, ' +
    'I have to admire what a beautiful piece of software Pearler is. It is simple, effective, and has a refined attention to the user experience. I definitely will be ' +
    'picking up a few pointers from there for my own projects. \n\n Gabriel'
  },
  {
    id: 1,
    title: 'Blog Post 1: Interests - Tech Related & Not',
    date: 'June 12, 2024',
    content: 'When I first started my tech journey, marked by the beginning of uni life, my perception of the space was that it all kind of ' +
    'came under the same umbrella. Oh, how naive I was. I quickly learned that there were, in fact, many umbrellas, each with sub-umbrellas, and even those had' +
    ' their own sub-sub-umbrellas. It was all a bit bewildering, to be honest. \n\n First I had to pick my degree. Check. Then I had to pick my university. Check. Now I ' +
    ' had to pick my specialisation within all of this? \n\n However, as time went on and I had the experience of a few more courses under my belt, this actually ' +
    'became quite appealing to me. I could pick and choose what I wanted to learn about, do without the particular fields that didn\'t interest me, and line ' +
    ' my career trajectory up in a very particular direction. Great! \n\n At the time of writing this blog, there are a few key areas spanning robotics and software that have piqued my interest. ' +
    ' These are: web development, computer vision, intelligent robots/systems, and cloud computing. I\'m sure this list will grow and change as I learn more about the field, ' +
    ' and this is by no means an exhaustive list, but for now this gives me a clear direction in where to head next. \n\n Outside of technology, I have a few normal-person hobbies' +
    ' that I enjoy. These include cars (both Japanese and European), retro technology (think 90s and 2000s), and craft beer! When I\'m not working or studying, these usually keep me pretty busy.' +
    ' Anyway, that\'s all from me. Until next time! \n\n Gabriel'
  },
];
