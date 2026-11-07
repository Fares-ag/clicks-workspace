import 'package:clicks_user/core/constants/map_style.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Result of the confirm-location sheet.
class ConfirmedSosLocation {
  final double latitude;
  final double longitude;
  final bool pinMoved;
  const ConfirmedSosLocation({
    required this.latitude,
    required this.longitude,
    required this.pinMoved,
  });
}

/// Shows the fix on a map with a draggable pin before an SOS is sent
/// (scenario 31). When the fix is missing, stale or vague the customer must
/// move the pin before the send button unlocks. Returns null when dismissed.
Future<ConfirmedSosLocation?> showConfirmLocationSheet(
  BuildContext context,
  SosConfirmLocation fix,
) {
  return showModalBottomSheet<ConfirmedSosLocation>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    enableDrag: false,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
    ),
    builder: (_) => _ConfirmLocationSheet(fix: fix),
  );
}

class _ConfirmLocationSheet extends StatefulWidget {
  const _ConfirmLocationSheet({required this.fix});
  final SosConfirmLocation fix;

  @override
  State<_ConfirmLocationSheet> createState() => _ConfirmLocationSheetState();
}

class _ConfirmLocationSheetState extends State<_ConfirmLocationSheet> {
  late LatLng _pin;
  bool _moved = false;

  @override
  void initState() {
    super.initState();
    _pin = LatLng(widget.fix.latitude, widget.fix.longitude);
  }

  void _movePin(LatLng next) {
    setState(() {
      _pin = next;
      _moved = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final reliable = widget.fix.reliable;
    final canSend = reliable || _moved;
    final accuracy = widget.fix.accuracyM;

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.78,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 16.h),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'dispatch.confirm_location_title'.tr(),
                    style: TextStyles.font16RegularBlack.copyWith(
                      fontWeight: FontWeight.w700,
                      fontSize: 18.sp,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Text(
              reliable
                  ? 'dispatch.confirm_location_body'.tr()
                  : 'dispatch.poor_fix_body'.tr(),
              style: TextStyles.font14RegularGrey.copyWith(
                color: reliable ? null : ColorsManager.mainColor,
                fontWeight: reliable ? null : FontWeight.w600,
              ),
            ),
            if (accuracy != null) ...[
              SizedBox(height: 4.h),
              Text(
                'dispatch.accuracy_label'.tr(
                  namedArgs: {'meters': accuracy.round().toString()},
                ),
                style: TextStyles.font12RegularGrey,
              ),
            ],
            SizedBox(height: 12.h),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12.r),
                child: GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: _pin,
                    zoom: reliable ? 17 : 13,
                  ),
                  style: kMapStyle,
                  myLocationEnabled: false,
                  zoomControlsEnabled: true,
                  mapToolbarEnabled: false,
                  onTap: _movePin,
                  gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
                    Factory<OneSequenceGestureRecognizer>(
                      () => EagerGestureRecognizer(),
                    ),
                  },
                  markers: {
                    Marker(
                      markerId: const MarkerId('sos_pin'),
                      position: _pin,
                      draggable: true,
                      onDragEnd: _movePin,
                    ),
                  },
                ),
              ),
            ),
            SizedBox(height: 12.h),
            SizedBox(
              height: 50.h,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: ColorsManager.mainColor,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10.r),
                  ),
                ),
                onPressed: canSend
                    ? () => Navigator.pop(
                          context,
                          ConfirmedSosLocation(
                            latitude: _pin.latitude,
                            longitude: _pin.longitude,
                            pinMoved: _moved,
                          ),
                        )
                    : null,
                child: Text(
                  canSend
                      ? 'dispatch.send_sos'.tr()
                      : 'dispatch.move_pin_first'.tr(),
                  style: TextStyles.font14Medium.copyWith(color: Colors.white),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
