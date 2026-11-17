import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Body,Controller,Get,Module,Post} from '@nestjs/common';
import {MarketingRequestSchema} from '@medsol/contracts';
@Controller() class AppController{
 @Get('health') health(){return{status:'ok',service:'medsol-ai-marketing-api',version:'0.1.0'}}
 @Post('marketing/requests') assess(@Body() body:unknown){const request=MarketingRequestSchema.parse(body);const correlationId=crypto.randomUUID();return{status:'ASSESSED',traceId:correlationId,request,decisions:[{agentId:'MKT-CMO-001',action:'ASSESS_OBJECTIVE',riskLevel:'R1'},{agentId:'MKT-STR-001',action:'ASSESS_MARKET',riskLevel:'R1'}],nextStep:'CAMPAIGN_PROPOSAL'}}
}
@Module({controllers:[AppController]})class AppModule{}
async function bootstrap(){const app=await NestFactory.create(AppModule);app.enableCors();await app.listen(Number(process.env.PORT??3001))}bootstrap();