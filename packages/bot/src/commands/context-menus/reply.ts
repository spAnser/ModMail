import { PrismaClient } from '@prisma/client';
import type { MessageContextMenuCommandInteraction, PermissionResolvable, ThreadChannel } from 'discord.js';
import { ApplicationCommandType } from 'discord.js';
import i18next from 'i18next';
import { singleton } from 'tsyringe';
import { getLocalizedProp, type CommandBody, type Command } from '../../struct/Command.js';
import { sendStaffThreadMessage } from '../../util/sendStaffThreadMessage.js';

@singleton()
export default class implements Command<ApplicationCommandType.Message> {
	public readonly interactionOptions: CommandBody<ApplicationCommandType.Message> = {
		...getLocalizedProp('name', 'context-menus.reply.name'),
		type: ApplicationCommandType.Message,
		default_member_permissions: '0',
		dm_permission: false,
	};

	public requiredClientPermissions: PermissionResolvable = ['SendMessagesInThreads', 'EmbedLinks'];

	public constructor(private readonly prisma: PrismaClient) {}

	public async handle(interaction: MessageContextMenuCommandInteraction<'cached'>, anon = false) {
		const thread = await this.prisma.thread.findFirst({
			where: {
				channelId: interaction.channelId,
				closedById: null,
			},
		});
		if (!thread) {
			await interaction.reply(i18next.t('common.errors.no_thread'));
			return;
		}

		if (interaction.targetMessage.author.id !== interaction.user.id) {
			await interaction.reply(i18next.t('common.errors.not_own_message'));
			return;
		}

		if (!interaction.targetMessage.content) {
			await interaction.reply(i18next.t('common.errors.no_content', { lng: interaction.locale }));
			return;
		}

		const settings = await this.prisma.guildSettings.findFirst({ where: { guildId: interaction.guild.id } });
		let modmailGuild = interaction.guild;
		if (settings?.mainGuildId) {
			modmailGuild = interaction.client.guilds.cache.get(settings.mainGuildId) ?? interaction.guild;
		}

		const member = await modmailGuild.members.fetch(thread.userId).catch(() => null);
		if (!member) {
			await interaction.reply(i18next.t('common.errors.no_member', { lng: interaction.locale }));
			return;
		}

		await sendStaffThreadMessage({
			content: interaction.targetMessage.content,
			attachment: interaction.targetMessage.attachments.first(),
			staff: interaction.member,
			member,
			channel: interaction.channel as ThreadChannel,
			threadId: thread.threadId,
			simpleMode: settings?.simpleMode ?? false,
			anon,
			interaction,
		});
	}
}
