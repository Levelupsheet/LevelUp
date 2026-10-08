-- Separate the learner's data-driven career choice from shared character artwork.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "selectedIndustry" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "selectedCareerPath" TEXT;

-- Catalog entries are suggestions only: no empty career is published to learners.
INSERT INTO "CareerCatalog" ("id","industry","careerPath","isActive","sortOrder","createdAt","updatedAt") VALUES
 ('career_it_helpdesk','Information Technology','Help Desk',TRUE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('career_healthcare_rn','Healthcare','RN',TRUE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('career_sales_rep','Sales','Sales Representative',TRUE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('career_software_dev','Software Development','Software Engineer',TRUE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('career_realestate_agent','Real Estate','Real Estate Agent',TRUE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('career_transport_cdl','Transportation','CDL Driver',TRUE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('career_trades_electrician','Industrial/Skilled Trades','Electrician',TRUE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('career_trades_hvac','Industrial/Skilled Trades','HVAC Technician',TRUE,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('career_trades_maintenance','Industrial/Skilled Trades','Industrial Maintenance Technician',TRUE,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("industry","careerPath") DO NOTHING;
