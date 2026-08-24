import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../../../core/api/dio_helper.dart';
import '../../../../../core/api/end_points/end_points.dart';
import '../../../../../core/helper/cache_helper.dart';
import '../../../../../core/sos_services/technician_socket_service.dart';

part 'login_state.dart';

class LoginCubit extends Cubit<LoginState> {
  LoginCubit() : super(LoginInitial());

  Map<String, dynamic> _loginPayload(String identifier, String password) {
    final raw = identifier.trim();
    if (raw.contains('@')) {
      return {"email": raw, "password": password};
    }
    var phone = raw.replaceAll(RegExp(r'[\s-]'), '');
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    // 8-digit local Qatar number → +974XXXXXXXX
    if (RegExp(r'^\d{8}$').hasMatch(digits)) {
      phone = '+974$digits';
    } else if (phone.isNotEmpty &&
        !phone.startsWith('+') &&
        RegExp(r'^\d+$').hasMatch(phone)) {
      phone = '+$phone';
    }
    return {"phone": phone, "password": password};
  }

  void login(String phone, String password) async {
    emit(LoginLoading());
    try {
      final payload = _loginPayload(phone, password);
      var response = await DioHelper.postData(
        url: EndPoints.login,
        auth: false,
        data: payload,
      );

      if (response.statusCode == 200) {
        final data = response.data as Map;
        final token = data['token']?.toString();
        final technician = (data['technician'] as Map?) ?? {};

        if (token != null && token.isNotEmpty) {
          await CacheHelper.secureWrite(CacheHelper.authTokenKey, token);
        }
        if (technician['id'] != null) {
          await CacheHelper.save("technician_id", technician['id'].toString());
        }

        final name = "${technician['firstName'] ?? ''} ${technician['lastName'] ?? ''}".trim();
        if (name.isNotEmpty) {
          await CacheHelper.save("technician_name", name);
        }

        final techPhone = technician['phone']?.toString() ?? payload['phone']?.toString();
        if (techPhone != null && techPhone.isNotEmpty) {
          await CacheHelper.save("technician_phone", techPhone);
        }
        final techEmail = technician['email']?.toString();
        if (techEmail != null && techEmail.isNotEmpty) {
          await CacheHelper.save("technician_email", techEmail);
        }
        final rejection = technician['rejectionReason']?.toString();
        if (rejection != null) {
          await CacheHelper.save("rejection_reason", rejection);
        }

        final applicationStatus = (technician['applicationStatus'] ?? 'Pending').toString();
        await CacheHelper.save("application_status", applicationStatus);

        TechnicianSocketService().reconnect();

        emit(LoginSuccess(applicationStatus));
      } else {
        final err = response.data is Map
            ? response.data["error"]?.toString()
            : null;
        emit(LoginError(err ?? "Invalid phone number or password"));
      }
    } catch (e) {
      emit(LoginError('Cannot reach API. Check API_BASE_URL / network.'));
    }
  }
}
