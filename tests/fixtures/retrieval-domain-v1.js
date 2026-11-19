'use strict';
// Invented plan provisions for retrieval evaluation. These are not PBGC rules,
// official field names, actual case files, or a factual-truth evaluation.
const {createHash}=require('node:crypto');
const document=(id,paragraphs)=>{
 const text=paragraphs.join('\n\n');let offset=0;
 return {id,name:id+'.txt',hash:createHash('sha256').update(text).digest('hex'),parserVersion:'synthetic-pbgc-retrieval-domain-v1',records:paragraphs.map((text,index)=>{const record={text,locator:{type:'text-line',line:index*2+1,offset,length:text.length,offsetUnit:'UTF-16 code units'}};offset+=text.length+2;return record;})};
};
const docs=[
 document('atlas-plan',[
  'SYNTHETIC ATLAS PLAN. This invented document is a retrieval test. It describes one example plan and must not be applied to a participant. The following paragraphs cover retirement provisions, survivor payments, disability, and administrative records.',
  'For Atlas participants, normal retirement age is 65. A participant can request the normal retirement benefit after that age. The administrator records the selected payment date separately from the date on which a participant first becomes eligible.',
  'For Atlas participants, early retirement factors by age are listed in the reduction schedule. The early retirement factor at age 60 is 0.80. The reduction schedule applies to an early payment and does not change the normal retirement age.',
  'For Atlas participants, the late retirement factor at age 70 is 1.30. A late payment uses the selected commencement date. This paragraph does not establish a late retirement factor for any other age or any other example plan.',
  'For Atlas participants, the disability benefit is 60 percent of the accrued monthly benefit. Medical certification is required before disability payments begin. A disability percentage measures a benefit amount and is not a retirement age.',
  'For Atlas participants, the surviving spouse receives monthly income after the participant dies. The spouse must submit a death certificate and an application. The survivor provision does not specify a mortality table or an interest rate.',
  'The Atlas administrator keeps signed election forms with the case records. A participant can correct a mailing address by sending a written request. The address request must identify the participant and must not be treated as a change to the benefit election.',
  'The Atlas review file contains a summary of source documents, unresolved questions, and the dates of administrative actions. Reviewers must check the source paragraph before using a quoted provision. This synthetic file has no legal authority.'
 ]),
 document('birch-plan',[
  'SYNTHETIC BIRCH PLAN. These invented provisions concern the Birch example only. Atlas and Birch are different plan names. This multi-paragraph file is deliberately similar to the Atlas file so that document names must remain bound to the returned source.',
  'For Birch participants, normal retirement age is 67. The administrator records an elected commencement date. The elected date is not itself a definition of the normal retirement age and does not establish a provision for the Atlas example.',
  'For Birch participants, the early retirement factor at age 60 is 0.75. Early retirement factors reduce the amount payable before normal retirement. A reduction factor is an amount multiplier rather than a participant age.',
  'For Birch participants, the benefit form conversion factor for a joint and survivor payment is 0.92. The conversion factor changes the payment form. It does not describe the late retirement factor or the early retirement reduction schedule.',
  'The Birch plan permits a single lump sum instead of a series of monthly installments. The election form records the payment choice. This paragraph does not give a maximum cash-out limit, an interest assumption, or a mortality basis.',
  'The Birch administrator reviews benefit applications and stores paper election forms in a locked cabinet. Copies of the signed forms remain part of the case record. Review dates and mailing dates do not change participant benefit provisions.',
  'The Birch source register includes the document name, version, and paragraph location. A quotation must remain tied to this example plan. The register is a finding aid and is not a substitute for the complete source text.'
 ]),
 document('cedar-funding',[
  'SYNTHETIC CEDAR FUNDING MEMORANDUM. The invented funding measures in this file concern Cedar. They do not define a payment factor for Atlas or Birch. Funding and payment provisions describe different properties even when they include similar numbers.',
  'For Cedar in 2024, the adjusted funding target attainment percentage is 82 percent. The measurement date is January 1, 2024. This percentage is a funding measure and must not be read as a participant age or as a reduction factor.',
  'For Cedar in 2023, the adjusted funding target attainment percentage is 79 percent. The older measurement is included for comparison. The 2023 figure does not replace the figure for 2024, and the measurement dates are part of the statement.',
  'The Cedar memorandum records the name of the preparer and the date of review. The preparer attached an administrative checklist. No mortality table, cash balance crediting rate, or early retirement factor is supplied in this memorandum.',
  'A reviewer must distinguish an amount used in a funding measurement from an amount used for a participant payment. The source uses percentages for both kinds of figures. The units, year, and subject must remain visible when a passage is quoted.'
 ]),
 document('delta-admin',[
  'SYNTHETIC DELTA ADMINISTRATION GUIDE. This invented guide describes how the example office records applications, addresses, elections, and source documents. The guide does not establish a participant benefit formula or actuarial assumptions.',
  'A participant who moves to a new residence must report the new mailing address in writing. The administrator checks the identity on the request before changing the address record. An address change does not alter a benefit payment form.',
  'An application received after June 30 is returned for additional review. The example deadline concerns application processing only. The deadline does not establish an age of retirement, a benefit amount, or an interest assumption.',
  'Signed election forms are stored in locked cabinets. A source register identifies the cabinet and the document reference. Electronic copies must retain the document name and the source paragraph location.',
  'The direct deposit form lists the bank account number. The account owner must sign the form before an administrator records the payment destination. The payment destination and the benefit amount are separate administrative facts.',
  'The Delta guide requires a death certificate when an applicant reports that a participant has died. A surviving spouse may submit the certificate with the application. This administrative instruction does not establish a survivor payment amount.'
 ]),
 document('elm-events',[
  'SYNTHETIC ELM CASE CHRONOLOGY. This invented chronology records administrative events. Dates in this file describe when an action occurred. They are not benefit commencement rules and are not evidence of a mortality table or an interest rate.',
  'The Elm plan amendment was signed on March 15, 2019. The example amendment changed the procedure for delivering an election notice. The chronology does not say that all participant provisions changed on that date.',
  'The Elm source inventory was reviewed on May 12, 2024. The reviewer checked that each source could be found using its document name and location. A review date is distinct from a plan effective date.',
  'The Elm administrator mailed an election notice on July 8, 2024. The mailing log identifies the recipient and the delivery method. An administrative mailing is not a finding that an election has already been made.',
  'The Elm review remains open until the reviewer resolves the outstanding source questions. The chronology stores questions separately from accepted quotations. A question in a file is not itself a plan provision.'
 ]),
 document('fir-medical',[
  'SYNTHETIC FIR MEDICAL CHECKLIST. This invented checklist describes required records for a disability application. It gives documentary requirements but does not establish any amount of disability benefit, age of eligibility, or medical conclusion.',
  'A physician must certify the medical condition before Fir disability payments begin. The administrator checks that the certification identifies the applicant. The checklist does not authorize an administrator to make a medical diagnosis.',
  'A missing signature causes the medical certification to be returned for completion. The returned form remains in the source inventory with the date of return. The return of a form does not mean that a benefit has been denied.',
  'The Fir checklist keeps medical records separate from the election form. A reviewer may quote the documentary requirement after checking the source. This test file contains no medical information about an actual person.'
 ])
];
const positive=[
 ['What is the normal retirement age for Atlas participants?','atlas-plan','For Atlas participants, normal retirement age is 65.'],
 ['What is the normal retirement age for Birch participants?','birch-plan','For Birch participants, normal retirement age is 67.'],
 ['What is the early retirement factor at age 60 for Atlas participants?','atlas-plan','The early retirement factor at age 60 is 0.80.'],
 ['What is the ERF at 60 for Atlas participants?','atlas-plan','The early retirement factor at age 60 is 0.80.'],
 ['What is the early retirement factor at age 60 for Birch participants?','birch-plan','For Birch participants, the early retirement factor at age 60 is 0.75.'],
 ['What is the late retirement factor at age 70 for Atlas participants?','atlas-plan','For Atlas participants, the late retirement factor at age 70 is 1.30.'],
 ['What is the LRF at 70 for Atlas participants?','atlas-plan','For Atlas participants, the late retirement factor at age 70 is 1.30.'],
 ['What is the benefit form conversion factor for Birch?','birch-plan','For Birch participants, the benefit form conversion factor for a joint and survivor payment is 0.92.'],
 ['What is the BFCF for Birch?','birch-plan','For Birch participants, the benefit form conversion factor for a joint and survivor payment is 0.92.'],
 ['What is the disability benefit percentage for Atlas participants?','atlas-plan','For Atlas participants, the disability benefit is 60 percent of the accrued monthly benefit.'],
 ['What money is available to an Atlas widow?','atlas-plan','For Atlas participants, the surviving spouse receives monthly income after the participant dies.'],
 ['Can a Birch participant cash out everything at once?','birch-plan','The Birch plan permits a single lump sum instead of a series of monthly installments.'],
 ['What is the adjusted funding target attainment percentage for Cedar in 2024?','cedar-funding','For Cedar in 2024, the adjusted funding target attainment percentage is 82 percent.'],
 ['What is the AFTAP for Cedar in 2024?','cedar-funding','For Cedar in 2024, the adjusted funding target attainment percentage is 82 percent.'],
 ['What is the AFTAP for Cedar in 2023?','cedar-funding','For Cedar in 2023, the adjusted funding target attainment percentage is 79 percent.'],
 ['How does a Delta participant report a residential relocation?','delta-admin','A participant who moves to a new residence must report the new mailing address in writing.'],
 ['What happens to a Delta application received after June 30?','delta-admin','An application received after June 30 is returned for additional review.'],
 ['Where are the signed Delta election forms kept?','delta-admin','Signed election forms are stored in locked cabinets.'],
 ['Which Delta form lists the bank account number?','delta-admin','The direct deposit form lists the bank account number.'],
 ['When was the Elm amendment signed?','elm-events','The Elm plan amendment was signed on March 15, 2019.'],
 ['Does a Fir applicant need a doctor to verify an illness?','fir-medical','A physician must certify the medical condition before Fir disability payments begin.'],
 ['What happens to a Fir medical certification with a missing signature?','fir-medical','A missing signature causes the medical certification to be returned for completion.']
].map(([question,sourceId,quote])=>({question,sourceId,quote}));
const negative=[
 'Which mortality table applies to Atlas benefits?',
 'What is the Atlas cash balance interest crediting rate for 2024?',
 'What is the Birch maximum cash-out amount?',
 'What is the normal retirement age for Cedar participants?',
 'What is the early retirement factor at age 55 for Atlas participants?',
 'What is the early retirement factor at age 60 for Delta participants?',
 'What is the adjusted funding target attainment percentage for Cedar in 2025?',
 'What is the survivor benefit percentage for Fir participants?',
 'What is the Elm plan termination date?',
 'What is the pension benefit formula for Delta?',
 'What is the Birch late retirement factor at age 70?',
 'What is the Atlas joint and survivor benefit form conversion factor?'
];
module.exports={id:'synthetic-pbgc-retrieval-domain-v1',docs,positive,negative,notice:'Synthetic retrieval screening evaluation only. Questions and invented provisions do not certify factual truth, general PBGC accuracy, model answer quality, or office scale.'};
