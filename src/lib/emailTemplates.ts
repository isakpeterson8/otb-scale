export type OpeningTemplateKey = 'initial_contact' | 'familiar_teacher' | 'shared_student' | 'virtual'

export interface OpeningTemplateConfig {
  description: string
  subject: string
  body: string
}

export interface TemplateDefinition {
  id: string
  name: string
  category: TemplateCategory
  categoryLabel: string
  subject: string
  body: string
  sequenceNumber?: number
  description?: string
}

export type TemplateCategory =
  | 'initial_outreach'
  | 'response'
  | 'post_visit'
  | 'reconnecting'
  | 'budget'
  | 'last_resort'
  | 'summer'
  | 'virtual'
  | 'scheduling'

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: 'initial_outreach', label: 'Initial Outreach Cadence' },
  { value: 'response', label: 'Response Templates' },
  { value: 'post_visit', label: 'Post-Visit' },
  { value: 'reconnecting', label: 'Reconnecting' },
  { value: 'budget', label: 'Budget & Compensation' },
  { value: 'last_resort', label: 'Last Resort' },
  { value: 'summer', label: 'Summer' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'scheduling', label: 'Scheduling' },
]

export const OPENING_TEMPLATES: Record<OpeningTemplateKey, OpeningTemplateConfig> = {
  initial_contact: {
    description: "For schools you haven't worked with before",
    subject: 'Guest Instructor',
    body: `$Name,

My name is $MyName, I am a local private music teacher based in $Location.

I have been volunteering with many local school music programs as a guest instructor to support their ensembles and individual sections. I wanted to extend the same opportunity to you as well!

I've listed some potential topics I have previously taught for other schools below.

- $Topic
- $Topic
- $Sectional
- $Masterclass

Are you interested in scheduling guest instruction?

I look forward to meeting you soon. If you have any questions, my phone number is $phonenumber.

Kind regards,
$MyName`,
  },
  familiar_teacher: {
    description: "For teachers you've met or worked with before",
    subject: 'Guest Instructor',
    body: `Hi $Name,

Hope you had a wonderful summer!

I've been working with a few other local music programs to provide guest instruction in their classroom. If it is helpful, I would also be happy to volunteer in your program! I've listed some potential topics I have previously taught for other schools, but I'm open to suggestions.

- $Topic
- $Topic
- $Sectional
- $Masterclass

Are you interested in scheduling guest instruction?

Looking forward to seeing you soon!

Kind regards,
$MyName`,
  },
  shared_student: {
    description: "For teachers who share a student with you",
    subject: 'Guest Instructor',
    body: `Hi $Name,

Hope you're well!

I wanted to reach out because I have so enjoyed teaching $studentname and really admire your music program.

I've been working with a few other local music programs to provide guest instruction in their classroom. Usually these visits have been virtual or pre-recorded.

If it is helpful, I would be happy to volunteer in your classroom as well! I've listed some potential topics below that I have previously taught for other schools, but I'm open to suggestions.

- $Topic
- $Topic
- $Sectional
- $Masterclass

Would you like to schedule a day for me to come as a guest instructor?

Looking forward to seeing you soon!

Kind regards,
$MyName`,
  },
  virtual: {
    description: "For virtual or flexible instruction opportunities",
    subject: 'Guest Instruction & Resources',
    body: `$Name,

My name is $MyName, I'm the owner of $StudioName.

I have been in contact with many music teachers in the area who are looking to bring guest instructors back into the classroom and are looking for flexible instruction. I wanted to extend the same opportunity to you as well!

I would be happy to support your program and students! I've listed some potential topics below that I have previously taught for other schools, and I would be happy to either provide a live virtual class or some pre-recorded lessons for your program.

- $Topic
- $Topic
- $Sectional
- $Masterclass

I know the virtual resources can be especially helpful for substitute teacher planning. Are you interested in bringing guest instructors to your classroom, or using some of these resources?

I look forward to meeting you soon. If you have any questions, my phone number is $phonenumber.

Kind regards,
$MyName`,
  },
}

export const FOLLOWUP_EMAILS: Record<2 | 3 | 4, { subject: string; body: string }> = {
  2: {
    subject: 'Re: [original subject]',
    body: `Hi $Name,

Just following up - would you be interested in me coming in (or visiting virtually!) as a guest instructor for the day?

Best,
$MyName`,
  },
  3: {
    subject: 'Re: [original subject]',
    body: `Hi $Name,

Wanted to make sure you had the opportunity to jump on this.

Would you be interested in a guest lesson for the day?

Best,
$MyName`,
  },
  4: {
    subject: 'Re: [original subject]',
    body: `Hi $Name,

Checking in to make sure you saw this. My schedule is filling up quickly for the semester - are you still interested in finding time for me to visit your class for a day?

Best,
$MyName`,
  },
}

export function getFollowupSubject(openingTemplate: OpeningTemplateKey): string {
  const base = OPENING_TEMPLATES[openingTemplate].subject
  return `Re: ${base}`
}

export const EMAIL_TEMPLATE_LIBRARY: TemplateDefinition[] = [
  // Initial Outreach Cadence
  {
    id: 'initial-1',
    name: 'Initial Contact — Email 1',
    category: 'initial_outreach',
    categoryLabel: 'Initial Outreach Cadence',
    subject: 'Guest Instructor',
    body: OPENING_TEMPLATES.initial_contact.body,
    sequenceNumber: 1,
  },
  {
    id: 'initial-2',
    name: 'Initial Contact — Email 2',
    category: 'initial_outreach',
    categoryLabel: 'Initial Outreach Cadence',
    subject: 'Re: Guest Instructor',
    body: FOLLOWUP_EMAILS[2].body,
    sequenceNumber: 2,
  },
  {
    id: 'initial-3',
    name: 'Initial Contact — Email 3',
    category: 'initial_outreach',
    categoryLabel: 'Initial Outreach Cadence',
    subject: 'Re: Guest Instructor',
    body: FOLLOWUP_EMAILS[3].body,
    sequenceNumber: 3,
  },
  {
    id: 'initial-4',
    name: 'Initial Contact — Email 4',
    category: 'initial_outreach',
    categoryLabel: 'Initial Outreach Cadence',
    subject: 'Re: Guest Instructor',
    body: FOLLOWUP_EMAILS[4].body,
    sequenceNumber: 4,
  },
  // Response Templates
  {
    id: 'response-later-followup',
    name: 'Later Follow Up',
    category: 'response',
    categoryLabel: 'Response Templates',
    subject: 'Checking back in',
    body: `Hi $Name,

Following up from my earlier message — is now a better time to discuss a guest instruction visit?

Best,
$MyName`,
  },
  {
    id: 'response-later-response',
    name: 'Later Response',
    category: 'response',
    categoryLabel: 'Response Templates',
    subject: 'Re: Guest Instructor',
    body: `Hi $Name,

Perfect, I'll plan to reach out again when timing is better. Looking forward to connecting!

Best,
$MyName`,
  },
  {
    id: 'response-next-semester',
    name: 'Maybe Next Semester',
    category: 'response',
    categoryLabel: 'Response Templates',
    subject: 'Re: Guest Instructor',
    body: `Hi $Name,

That works! I'll reach back out at the start of next semester to find a time that works for both of us.

Looking forward to it!

Best,
$MyName`,
  },
  {
    id: 'response-no',
    name: 'No Response',
    category: 'response',
    categoryLabel: 'Response Templates',
    subject: 'Re: Guest Instructor',
    body: `Hi $Name,

No worries at all — I understand you're busy. I'll keep your program in mind and reach out again if the opportunity arises.

Best,
$MyName`,
  },
  {
    id: 'response-not-interested',
    name: 'Not Interested Response',
    category: 'response',
    categoryLabel: 'Response Templates',
    subject: 'Re: Guest Instructor',
    body: `Hi $Name,

I completely understand! Thank you for getting back to me. I'll keep your program in mind for the future, and feel free to reach out if anything changes.

Best,
$MyName`,
  },
  {
    id: 'response-yes-circle-back',
    name: 'Yes - Circle Back',
    category: 'response',
    categoryLabel: 'Response Templates',
    subject: 'Re: Guest Instructor — Scheduling',
    body: `Hi $Name,

Just wanted to circle back on our earlier conversation — you mentioned you'd be interested in having me in as a guest instructor. Do you have some dates in mind?

Looking forward to it!

Best,
$MyName`,
  },
  // Post-Visit
  {
    id: 'post-visit-school',
    name: 'School Post-Visit Cadence',
    category: 'post_visit',
    categoryLabel: 'Post-Visit',
    subject: 'Thank you — Visit',
    body: `Hi $Name,

Thank you so much for having me in today! I really enjoyed working with your students.

I'd love to make this a regular thing. Would it work to schedule a follow-up visit for next month?

Best,
$MyName`,
  },
  {
    id: 'post-visit-flyer-only',
    name: 'Flyer Only Post-Visit',
    category: 'post_visit',
    categoryLabel: 'Post-Visit',
    subject: 'Great meeting you',
    body: `Hi $Name,

It was great meeting you today! I left some flyers with your office about private music lessons. Please feel free to share them with any students or families who might be interested.

Looking forward to staying connected!

Best,
$MyName`,
  },
  {
    id: 'post-visit-flyer-shared',
    name: 'Flyer Shared Thank You',
    category: 'post_visit',
    categoryLabel: 'Post-Visit',
    subject: 'Thank you for sharing!',
    body: `Hi $Name,

Thank you so much for sharing my information with your students and families. I've already heard from a few of them!

Please don't hesitate to reach out if I can support your program in any way.

Best,
$MyName`,
  },
  {
    id: 'post-visit-return',
    name: 'Return Visit Email',
    category: 'post_visit',
    categoryLabel: 'Post-Visit',
    subject: 'Return Visit — Guest Instruction',
    body: `Hi $Name,

I hope things are going well with your program! I really enjoyed my last visit and wanted to see if you'd be interested in having me back for another session.

I have some new topics I'd love to cover with your students.

Best,
$MyName`,
  },
  // Reconnecting
  {
    id: 'reconnect-fall-spring',
    name: 'Fall/Spring Reconnecting',
    category: 'reconnecting',
    categoryLabel: 'Reconnecting',
    subject: 'New Semester — Guest Instruction',
    body: `Hi $Name,

Hope you had a wonderful break! As we head into a new semester, I wanted to reach out again about the possibility of coming in as a guest instructor.

Would this be a good time to schedule a visit?

Best,
$MyName`,
  },
  {
    id: 'reconnect-familiar',
    name: 'Familiar Teacher',
    category: 'reconnecting',
    categoryLabel: 'Reconnecting',
    subject: 'Guest Instructor',
    body: OPENING_TEMPLATES.familiar_teacher.body,
  },
  {
    id: 'reconnect-shared-student',
    name: 'Shared Student',
    category: 'reconnecting',
    categoryLabel: 'Reconnecting',
    subject: 'Guest Instructor',
    body: OPENING_TEMPLATES.shared_student.body,
  },
  // Budget & Compensation
  {
    id: 'budget-negotiation',
    name: 'Budget Negotiation',
    category: 'budget',
    categoryLabel: 'Budget & Compensation',
    subject: 'Re: Guest Instructor',
    body: `Hi $Name,

Thank you for getting back to me about budget constraints. I completely understand — I'm flexible and open to discussion.

For reference, I've worked with programs that weren't able to offer compensation at all, and I've been happy to volunteer. Would it help to discuss what might work for your school?

Best,
$MyName`,
  },
  {
    id: 'budget-recurring',
    name: 'Compensation for Recurring',
    category: 'budget',
    categoryLabel: 'Budget & Compensation',
    subject: 'Re: Recurring Guest Instruction',
    body: `Hi $Name,

I'm so glad the visits have been going well! As we discuss continuing on a recurring basis, I wanted to raise the topic of compensation.

Would $Amount per session work for your program, or would you prefer to discuss other arrangements?

Best,
$MyName`,
  },
  // Last Resort
  {
    id: 'last-resort-1',
    name: 'Cold Lesson Promo — Email 1',
    category: 'last_resort',
    categoryLabel: 'Last Resort',
    subject: 'Private Lessons for Your Students',
    body: `Hi $Name,

My name is $MyName, and I offer private music lessons in $Location.

Many of my students come from school music programs, and I'd love to share information about my studio with your families. Would you be open to me leaving some materials with your office?

Best,
$MyName`,
    sequenceNumber: 1,
  },
  {
    id: 'last-resort-2',
    name: 'Cold Lesson Promo — Email 2',
    category: 'last_resort',
    categoryLabel: 'Last Resort',
    subject: 'Re: Private Lessons for Your Students',
    body: `Hi $Name,

Just following up — would it be possible to share information about private music lessons with your school families?

Best,
$MyName`,
    sequenceNumber: 2,
  },
  {
    id: 'last-resort-3',
    name: 'Cold Lesson Promo — Email 3',
    category: 'last_resort',
    categoryLabel: 'Last Resort',
    subject: 'Re: Private Lessons for Your Students',
    body: `Hi $Name,

One last note — I understand if the timing isn't right. Feel free to reach out any time if you'd like to connect about supporting your students with private lessons.

Best,
$MyName`,
    sequenceNumber: 3,
  },
  // Summer
  {
    id: 'summer-camp',
    name: 'Summer Lesson Package Camp Offer',
    category: 'summer',
    categoryLabel: 'Summer',
    subject: 'Summer Music Programs — $StudioName',
    body: `Hi $Name,

Hope you're having a wonderful end of the school year! I wanted to reach out about summer music programs.

I offer flexible summer lesson packages and a summer music camp through $StudioName that might be a great fit for your students. I'd love to share details with your families.

Best,
$MyName`,
  },
  // Virtual
  {
    id: 'virtual-1',
    name: 'Virtual Initial Contact — Email 1',
    category: 'virtual',
    categoryLabel: 'Virtual',
    subject: 'Guest Instruction & Resources',
    body: OPENING_TEMPLATES.virtual.body,
    sequenceNumber: 1,
  },
  {
    id: 'virtual-2',
    name: 'Virtual Initial Contact — Email 2',
    category: 'virtual',
    categoryLabel: 'Virtual',
    subject: 'Re: Guest Instruction & Resources',
    body: `Hi $Name,

Just following up — would you be interested in a virtual guest instruction session for your class?

Best,
$MyName`,
    sequenceNumber: 2,
  },
  {
    id: 'virtual-3',
    name: 'Virtual Initial Contact — Email 3',
    category: 'virtual',
    categoryLabel: 'Virtual',
    subject: 'Re: Guest Instruction & Resources',
    body: `Hi $Name,

Wanted to make sure you had the chance to consider this. Virtual instruction can be especially useful for substitute planning or when scheduling in-person visits is difficult.

Would you be open to a free virtual session?

Best,
$MyName`,
    sequenceNumber: 3,
  },
  {
    id: 'virtual-4',
    name: 'Virtual Initial Contact — Email 4',
    category: 'virtual',
    categoryLabel: 'Virtual',
    subject: 'Re: Guest Instruction & Resources',
    body: `Hi $Name,

Last check-in — I have some pre-recorded content ready to share that your students could watch independently. It might be perfect for a sub day!

Are you interested?

Best,
$MyName`,
    sequenceNumber: 4,
  },
  // Scheduling
  {
    id: 'scheduling-1',
    name: 'School Scheduling Follow-Up — Email 1',
    category: 'scheduling',
    categoryLabel: 'Scheduling',
    subject: 'Scheduling — Guest Instruction Visit',
    body: `Hi $Name,

I'm so glad you're interested in having me in! To get things on the calendar, what dates work best for you? I'm generally available $AvailableDays.

Best,
$MyName`,
    sequenceNumber: 1,
  },
  {
    id: 'scheduling-2',
    name: 'School Scheduling Follow-Up — Email 2',
    category: 'scheduling',
    categoryLabel: 'Scheduling',
    subject: 'Re: Scheduling — Guest Instruction Visit',
    body: `Hi $Name,

Just following up on scheduling — do any upcoming dates work for a guest instruction visit?

Best,
$MyName`,
    sequenceNumber: 2,
  },
  {
    id: 'scheduling-3',
    name: 'School Scheduling Follow-Up — Email 3',
    category: 'scheduling',
    categoryLabel: 'Scheduling',
    subject: 'Re: Scheduling — Guest Instruction Visit',
    body: `Hi $Name,

Wanted to check back in — I know scheduling can get hectic! Any dates come to mind for a visit?

Best,
$MyName`,
    sequenceNumber: 3,
  },
  {
    id: 'scheduling-4',
    name: 'School Scheduling Follow-Up — Email 4',
    category: 'scheduling',
    categoryLabel: 'Scheduling',
    subject: 'Re: Scheduling — Guest Instruction Visit',
    body: `Hi $Name,

My schedule is filling up for the semester — I wanted to make sure we found time before it gets too booked. Would any date this month work?

Best,
$MyName`,
    sequenceNumber: 4,
  },
]
