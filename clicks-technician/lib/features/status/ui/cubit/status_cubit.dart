import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../../core/api/dio_helper.dart';
import '../../../../core/api/end_points/end_points.dart';
import '../../../../core/helper/cache_helper.dart';
import '../../../../core/helper/extensions.dart';
import '../../../../core/routing/routes.dart';
import 'package:flutter/material.dart';

part 'status_state.dart';

class StatusCubit extends Cubit<StatusState> {
  StatusCubit({StatusType initialStatus = StatusType.pending}) : super(StatusInitial()) {
    currentStatus = initialStatus;
    displayName = CacheHelper.get('technician_name')?.toString() ?? '';
    displayPhone = CacheHelper.get('technician_phone')?.toString() ?? '';
    displayEmail = CacheHelper.get('technician_email')?.toString() ?? '';
    rejectionReason = CacheHelper.get('rejection_reason')?.toString() ?? '';
    _poll();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _poll());
  }

  StatusType currentStatus = StatusType.pending;
  String displayName = '';
  String displayPhone = '';
  String displayEmail = '';
  String rejectionReason = '';
  Timer? _timer;

  Future<void> _poll() async {
    final phone = CacheHelper.get('technician_phone')?.toString();
    if (phone == null || phone.isEmpty) {
      emit(ChangeStatusTypeStatusState(currentStatus));
      return;
    }
    try {
      final res = await DioHelper.getData(
        url: EndPoints.applicationStatus,
        auth: false,
        query: {"phone": phone},
      );
      if (res.statusCode != 200) return;
      final data = res.data as Map;
      final status = (data['status'] ?? '').toString();
      displayName =
          "${data['firstName'] ?? ''} ${data['lastName'] ?? ''}".trim().isNotEmpty
              ? "${data['firstName'] ?? ''} ${data['lastName'] ?? ''}".trim()
              : displayName;
      displayPhone = data['phone']?.toString() ?? displayPhone;
      displayEmail = data['email']?.toString() ?? displayEmail;
      rejectionReason = data['rejectionReason']?.toString() ?? rejectionReason;
      await CacheHelper.save('application_status', status);
      if (status == 'Approved') {
        currentStatus = StatusType.approved;
      } else if (status == 'Rejected') {
        currentStatus = StatusType.rejected;
      } else {
        currentStatus = StatusType.pending;
      }
      emit(ChangeStatusTypeStatusState(currentStatus));
    } catch (_) {}
  }

  void goHomeIfApproved(BuildContext context) {
    if (currentStatus == StatusType.approved && context.mounted) {
      context.offAllNamed(Routes.home);
    }
  }

  void changeStatus(StatusType newStatus) {
    currentStatus = newStatus;
    emit(ChangeStatusTypeStatusState(currentStatus));
  }

  @override
  Future<void> close() {
    _timer?.cancel();
    return super.close();
  }
}

enum StatusType { pending, approved, rejected }
