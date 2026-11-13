import 'dart:math' as math;
import 'package:clicks_user/core/components/app_button.dart';
import 'package:clicks_user/core/helper/assets_manager.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/sos_services/sos_support_contact.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/helper/app_snack_bars.dart';
import '../../core/routing/routes.dart';
import '../../core/services/session_sync.dart';
import '../../core/sos_services/event_scope.dart';

@visibleForTesting
bool showImmediateSosCallCard({
  required bool timerExpired,
  required bool highDemand,
}) =>
    timerExpired || highDemand;

class TimerSosScreen extends StatefulWidget {
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
  State<TimerSosScreen> createState() => _TimerSosScreenState();
}

class _TimerSosScreenState extends State<TimerSosScreen> {
  /// Set when the 60 s contact promise runs out with nobody on the line yet:
  /// the countdown is replaced by a "Still connecting you — call us" card
  /// (scenario 40), backed server-side by the escalation ladder.
  bool _showCallCard = false;

  bool get isEmergency => widget.isEmergency;

  late final String? _sosId = context.read<SosCubit>().sosId;

  /// Only this SOS's events (scenario 62): another job's cancel must not
  /// abandon a live SOS in the UI.
  late final EventScope _scope = EventScope(sosId: _sosId);

  @override
  void dispose() {
    ActiveSessionScreen.leave(Routes.timerSos, _sosId);
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    ActiveSessionScreen.enter(
      Routes.timerSos,
      _sosId,
      () => mounted && (ModalRoute.of(context)?.isCurrent ?? true),
    );
    final cubit = context.read<SosCubit>();
    // Picks up the served support number and any outstanding balance when
    // the screen is opened from resume rather than straight after createSOS.
    cubit.refreshSessionExtras().then((_) {
      if (mounted) setState(() {});
    });
    final expiresAt = cubit.expiresAt;
    if (expiresAt != null && expiresAt.isBefore(DateTime.now())) {
      _showCallCard = true;
    }
  }

  @override
  Widget build(BuildContext context) {
    final outstanding = context.read<SosCubit>().outstandingBalance;
    return Scaffold(
      body: BlocListener<SosCubit, SosState>(
        listenWhen: (_, state) => _scope.matchesState(state),
        listener: (context, state) {
          if (state is SosStillConnecting) {
            // Escalation ladder step 3: nobody has picked up — offer the
            // call card now, with the number the server sent (S38/40).
            setState(() => _showCallCard = true);
          } else if (state is SosInCall) {
            context.pop();
            context.toNamed(Routes.inCall);
          } else if (state is JobCancelled ||
              state is SosCancelled ||
              state is SosClosed) {
            AppSnackBars.errorSnackBar(
              isEmergency
                  ? 'home.sos_cancelled'.tr()
                  : 'services.request_cancelled'.tr(),
            );
            context.offAllNamed(Routes.home);
          } else if (state is SosScheduled) {
            AppSnackBars.successSnackBar('services.booking_confirmed'.tr());
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
              if (!isEmergency && widget.serviceType != null) ...[
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
                    widget.serviceLabel ?? widget.serviceType!,
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
                  context.watch<SosCubit>().highDemand
                      ? 'dispatch.high_demand_body'.tr()
                      : isEmergency
                          ? 'home.team_reviewing'.tr()
                          : 'services.team_reviewing'.tr(),
                  style: TextStyles.font14Regular,
                  textAlign: TextAlign.center,
                ),
              ),
              if (outstanding > 0) OutstandingBalanceBanner(amount: outstanding),
              if (context.watch<SosCubit>().highDemand)
                const HighDemandBanner(),
              Spacer(),
              if (!_showCallCard)
                Builder(
                  builder: (context) {
                    final expiresAt = context.watch<SosCubit>().expiresAt;
                    final remaining = expiresAt != null
                        ? expiresAt.difference(DateTime.now())
                        : const Duration(
                            seconds: SosCubit.contactCountdownSeconds,
                          );
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
                        // The SOS stays open (dispatch is escalated server-side);
                        // the customer gets a direct line instead of a frozen 0.
                        if (mounted) setState(() => _showCallCard = true);
                      },
                    );
                  },
                ),
              if (showImmediateSosCallCard(
                timerExpired: _showCallCard,
                highDemand: context.watch<SosCubit>().highDemand,
              ))
                const StillConnectingCallCard(),
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
                      onPressed: SosSupportContact.call,
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

class HighDemandBanner extends StatelessWidget {
  const HighDemandBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF3F3),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFFE0E0)),
      ),
      child: Row(
        children: [
          const Icon(Icons.groups_outlined, color: Color(0xFFB42318)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'dispatch.high_demand_title'.tr(),
              style: TextStyles.font12RegularBlack.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "You have QAR X outstanding; the technician can collect it." (scenario 91)
class OutstandingBalanceBanner extends StatelessWidget {
  final double amount;
  const OutstandingBalanceBanner({super.key, required this.amount});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8E1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFFE082)),
      ),
      child: Row(
        children: [
          const Icon(Icons.receipt_long_outlined, color: Color(0xFF8D6E00)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'dispatch.outstanding_banner'.tr(
                namedArgs: {'amount': amount.toStringAsFixed(2)},
              ),
              style: TextStyles.font12RegularBlack,
            ),
          ),
        ],
      ),
    );
  }
}

/// Shown when the contact countdown runs out: a direct line to dispatch.
class StillConnectingCallCard extends StatelessWidget {
  const StillConnectingCallCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF3F3),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFFE0E0)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'dispatch.still_connecting_title'.tr(),
            style: TextStyles.font28Bold.copyWith(fontSize: 22),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'dispatch.still_connecting_body'.tr(),
            style: TextStyles.font14Regular,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton.icon(
              onPressed: SosSupportContact.call,
              icon: const Icon(Icons.phone, color: Colors.white),
              style: FilledButton.styleFrom(
                backgroundColor: ColorsManager.mainColor,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              label: Text(
                '${'dispatch.call_us_now'.tr()}  ${SosSupportContact.phone}',
                style: TextStyles.font14Regular.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
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
