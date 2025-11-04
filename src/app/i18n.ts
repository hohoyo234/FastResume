export type Lang = 'zh' | 'en';

const strings = {
  workExperience: { zh: '工作经历', en: 'Work Experience' },
  additionalWorkExperience: { zh: '补充工作经历', en: 'Additional Work Experience' },
  education: { zh: '教育经历', en: 'Education' },
  technicalSkills: { zh: '技能', en: 'Technical Skills' },
  technicalLabel: { zh: '技术', en: 'Technical' },
  generalLabel: { zh: '通用', en: 'General' },
  jobTitle: { zh: '职位', en: 'Job Title' },
  organization: { zh: '机构', en: 'Organization' },
  company: { zh: '公司', en: 'Company' },
  period: { zh: '时间段', en: 'Period' },
  description: { zh: '描述', en: 'Description' },
  jobDescription: { zh: '岗位描述', en: 'Job Description' },
  additionalVolunteer: { zh: '补充的志愿者经验', en: 'Volunteer Experience' },
  targetJD: { zh: '目标岗位 JD', en: 'Target JD' },
} as const;

export type I18nKey = keyof typeof strings;

export function t(lang: Lang, key: I18nKey): string {
  return strings[key][lang];
}

// 为现有的 sectionTitle(zh, en) 兼容传参
export const STR = {
  workExperience: [strings.workExperience.zh, strings.workExperience.en],
  additionalWorkExperience: [strings.additionalWorkExperience.zh, strings.additionalWorkExperience.en],
  education: [strings.education.zh, strings.education.en],
  technicalSkills: [strings.technicalSkills.zh, strings.technicalSkills.en],
};