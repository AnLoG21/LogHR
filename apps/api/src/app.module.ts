import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrgUnitsModule } from './org-units/org-units.module';
import { ProfilesModule } from './profiles/profiles.module';
import { DemandsModule } from './demands/demands.module';
import { HiringRequestsModule } from './hiring-requests/hiring-requests.module';
import { VacanciesModule } from './vacancies/vacancies.module';
import { CandidatesModule } from './candidates/candidates.module';
import { FunnelsModule } from './funnels/funnels.module';
import { TasksModule } from './tasks/tasks.module';
import { OffersModule } from './offers/offers.module';
import { ChecksModule } from './checks/checks.module';
import { DictionariesModule } from './dictionaries/dictionaries.module';
import { TagsModule } from './tags/tags.module';
import { BrandingModule } from './branding/branding.module';
import { PublicationsModule } from './publications/publications.module';
import { JobBoardsModule } from './job-boards/job-boards.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PdnModule } from './pdn/pdn.module';
import { ImportExportModule } from './import-export/import-export.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StorageModule } from './storage/storage.module';
import { QueueModule } from './queue/queue.module';
import { FiltersModule } from './filters/filters.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AiModule } from './ai/ai.module';
import { VisibilityModule } from './visibility/visibility.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    PrismaModule,
    StorageModule,
    QueueModule,
    AuthModule,
    UsersModule,
    OrgUnitsModule,
    ProfilesModule,
    DemandsModule,
    HiringRequestsModule,
    VacanciesModule,
    CandidatesModule,
    FunnelsModule,
    TasksModule,
    OffersModule,
    ChecksModule,
    DictionariesModule,
    TagsModule,
    BrandingModule,
    PublicationsModule,
    JobBoardsModule,
    AssessmentsModule,
    NotificationsModule,
    PdnModule,
    ImportExportModule,
    ReportsModule,
    DashboardModule,
    FiltersModule,
    IntegrationsModule,
    AiModule,
    VisibilityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
