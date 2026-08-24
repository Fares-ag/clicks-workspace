import 'dart:math' as math;
import 'package:clicks_user/core/components/app_button.dart';
import 'package:clicks_user/core/helper/assets_manager.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/helper/app_snack_bars.dart';
import '../../core/routing/routes.dart';

class TimerSosScreen extends StatelessWidget {
  final bool isEmergency;
  final String? serviceType;
  final String? serviceLabel;

  const TimerSosScreen({
    super.key,
    this.isEmergency = true,
    this.serviceType,
    this.serviceLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: BlocListener<SosCubit, SosState>(
        listener: (context, state) {
          if (state is SosInCall) {
            context.pop();
            context.toNamed(Routes.inCall);
          } else if (state is JobCancelled || state is SosCancelled) {
            AppSnackBars.errorSnackBar(
              isEmergency
                  ? 'home.sos_cancelled'.tr()
                  : 'services.request_cancelled'.tr(),
            );
            context.offAllNamed(Routes.home);
          } else if (state is SosExpired) {
            AppSnackBars.errorSnackBar(
              isEmergency
                  ? 'home.sos_expired'.tr()
                  : 'services.request_expired'.tr(),
            );
            context.offAllNamed(Routes.home);
          } else if (state is SosError) {
            // The server answers a rejected cancel with an `error` event
            // instead of `sosCancelled` — surface it, otherwise the sheet just
            // closes and the user gets no feedback and no way to retry.
            AppSnackBars.errorSnackBar(
              state.message.trim().isEmpty
                  ? 'home.cancel_failed'.tr()
                  : state.message,
            );
          }
        },
        child: SizedBox(
          width: MediaQuery.sizeOf(context).width,
          child: Column(
            children: [
              SizedBox(height: 60),
              Text(
                isEmergency
                    ? 'home.help_on_way'.tr()
                    : 'services.request_received'.tr(),
                style: TextStyles.font28Bold.copyWith(fontSize: 30),
                textAlign: TextAlign.center,
              ),
              if (!isEmergency && serviceType != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF3F3),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFFFE0E0)),
                  ),
                  child: Text(
                    serviceLabel ?? serviceType!,
                    style: TextStyles.font12RegularBlack.copyWith(
                      color: ColorsManager.mainColor,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                child: Text(
                  isEmergency
                      ? 'home.team_reviewing'.tr()
                      : 'services.team_reviewing'.tr(),
                  style: TextStyles.font14Regular,
                  textAlign: TextAlign.center,
                ),
              ),
              Spacer(),
              Builder(
                builder: (context) {
                  final expiresAt = context.watch<SosCubit>().expiresAt;
                  final remaining = expiresAt != null
                      ? expiresAt.difference(DateTime.now())
                      : const Duration(seconds: 60);
                  final duration = remaining.isNegative
                      ? Duration.zero
                      : remaining;
                  return CircleCountdown(
                    key: ValueKey(expiresAt?.toIso8601String() ?? 'fallback'),
                    duration: duration.inSeconds < 1
                        ? const Duration(seconds: 1)
                        : duration,
                    size: 200,
                    strokeWidth: 14,
                    ringColor: const Color(0xFF8B0000),
                    progressColor: const Color(0xFF8B0000),
                    onComplete: () {
                      // 60s is a contact promise only — SOS stays active; keep waiting.
                    },
                  );
                },
              ),
              Spacer(),
              Row(
                children: [
                  Container(
                    margin: EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: ColorsManager.mainColor,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: MaterialButton(
                      elevation: 2,
                      onPressed: () async {
                        final uri = Uri.parse('tel:70090220');
                        await launchUrl(uri);
                      },
                      color: ColorsManager.mainColor,
                      height: 55,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        spacing: 16,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SvgPicture.asset(AssetsManager.phoneCallSvg),

                          Text(
                            'home.reach_out'.tr(),
                            style: TextStyles.font12RegularBlack.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  Expanded(
                    child: AppButton(
                      onPressed: () {
                        showCancelSOSSheet(
                          context,
                          isEmergency: isEmergency,
                        );
                      },
                      label:
                          isEmergency
                              ? 'home.cancel_sos'.tr()
                              : 'services.cancel_request'.tr(),
                      borderColor: Colors.grey,
                      textColor: Colors.black,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future showCancelSOSSheet(
  BuildContext context, {
  bool isEmergency = true,
}) {
  return showModalBottomSheet(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      String? selected;
      bool submitting = false;
      final noteCtrl = TextEditingController();

      return StatefulBuilder(
        builder: (ctx, setState) {
          Widget reasonTile(String key, String label) {
            final checked = selected == key;
            return InkWell(
              onTap: () {
                setState(() {
                  selected = checked ? null : key;
                });
              },
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Checkbox(
                      value: checked,
                      activeColor: ColorsManager.mainColor,
                      onChanged: (_) {
                        setState(() {
                          selected = checked ? null : key;
                        });
                      },
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(child: Text(label)),
                  ],
                ),
              ),
            );
          }

          final bottomInset = MediaQuery.of(ctx).viewInsets.bottom;
          final canSubmit = selected != null &&
              (selected != 'other' || noteCtrl.text.trim().isNotEmpty);

          return Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 16 + bottomInset),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                InkWell(
                  onTap: () {
                    Navigator.pop(ctx);
                  },
                  child: Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: CircleAvatar(
                      backgroundColor: Colors.grey.shade100,
                      child: Icon(Icons.close, color: Colors.grey),
                    ),
                  ),
                ),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    isEmergency
                        ? 'home.cancel_sos'.tr()
                        : 'services.cancel_request'.tr(),
                    style: Theme.of(
                      ctx,
                    ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 8),
                const Divider(height: 1),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text('home.please_provide_reason'.tr()),
                ),
                const SizedBox(height: 4),

                reasonTile('no_longer_needed', 'home.issue_resolved'.tr()),
                reasonTile('switching', 'home.accidental_request'.tr()),
                reasonTile(
                  'privacy',
                  'home.changed_mind'.tr(),
                ),
                reasonTile(
                  'foundanotherserviceprovider',
                  'home.found_another_provider'.tr(),
                ),
                reasonTile('other', 'settings.other'.tr()),

                const SizedBox(height: 8),

                TextField(
                  controller: noteCtrl,
                  maxLines: 3,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'settings.enter_reason'.tr(),
                    filled: true,
                    fillColor: Colors.grey.shade50,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    contentPadding: const EdgeInsets.all(12),
                  ),
                ),

                const SizedBox(height: 16),

                Row(
                  children: [
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: ColorsManager.mainColor,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          minimumSize: const Size.fromHeight(48),
                        ),
                        onPressed: canSubmit && !submitting
                            ? () async {
                          if (selected == null) return;
                          if (selected == 'other' &&
                              noteCtrl.text.trim().isEmpty) {
                            return;
                          }
                          final reason = selected == 'other'
                              ? noteCtrl.text.trim()
                              : selected!;
                          final cubit = context.read<SosCubit>();
                          setState(() => submitting = true);
                          final sent = await cubit.cancelSOS(reason: reason);
                          if (!ctx.mounted) return;
                          Navigator.pop(ctx); // close bottom sheet
                          if (!sent) {
                            // Never leave the SOS screen on a cancel we could
                            // not send — that orphans an active SOS and keeps
                            // a technician dispatched.
                            AppSnackBars.errorSnackBar(
                              'home.cancel_failed'.tr(),
                            );
                          }
                          // On success the server replies `sosCancelled`; the
                          // SOS screen's BlocListener returns the user home.
                        }
                            : null,
                        child: Text('common.submit'.tr()),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      );
    },
  );
}

class CircleCountdown extends StatelessWidget {
  final Duration duration;
  final double size;
  final double strokeWidth;
  final Color ringColor; // background ring
  final Color progressColor; // progress arc color
  final TextStyle? textStyle;
  final VoidCallback? onComplete;

  const CircleCountdown({
    super.key,
    required this.duration,
    this.size = 180,
    this.strokeWidth = 12,
    this.ringColor = const Color(0xFFB71C1C), // deep red like screenshot
    this.progressColor = const Color(0xFFB71C1C),
    this.textStyle,
    this.onComplete,
  });

  @override
  Widget build(BuildContext context) {
    final style =
        textStyle ??
        const TextStyle(
          fontSize: 56,
          fontWeight: FontWeight.w700,
          color: Colors.black,
        );

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 1.0, end: 0.0),
      duration: duration,
      onEnd: onComplete,
      curve: Curves.linear,
      builder: (context, value, child) {
        // value goes 1.0 -> 0.0, map to remaining seconds
        final remaining = (duration.inSeconds * value).ceil();
        return SizedBox(
          width: size,
          height: size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: Size.square(size),
                painter: _RingPainter(
                  progress: 1.0 - value, // 0 -> 1
                  strokeWidth: strokeWidth,
                  ringColor: ringColor.withValues(alpha: 0.25), // faint outer ring
                  progressColor: progressColor,
                ),
              ),
              Text('$remaining', style: style),
            ],
          ),
        );
      },
    );
  }
}

class _RingPainter extends CustomPainter {
  final double progress; // 0..1
  final double strokeWidth;
  final Color ringColor;
  final Color progressColor;

  _RingPainter({
    required this.progress,
    required this.strokeWidth,
    required this.ringColor,
    required this.progressColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.shortestSide - strokeWidth) / 2;

    final base =
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth
          ..strokeCap = StrokeCap.round
          ..color = ringColor;

    final prog =
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth
          ..strokeCap = StrokeCap.round
          ..color = progressColor;

    // Base ring
    canvas.drawCircle(center, radius, base);

    // Progress arc (starts at top, sweeps clockwise)
    final rect = Rect.fromCircle(center: center, radius: radius);
    const startAngle = -math.pi / 2;
    final sweep = 2 * math.pi * progress;
    canvas.drawArc(rect, startAngle, sweep, false, prog);
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) {
    return progress != old.progress ||
        strokeWidth != old.strokeWidth ||
        ringColor != old.ringColor ||
        progressColor != old.progressColor;
  }
}
