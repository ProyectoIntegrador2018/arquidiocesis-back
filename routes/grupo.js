const moment = require('moment');

const getall = async (firestore, req, res)=>{
    var grupos = [];

    if(req.user.admin){ // Is admin, return all
        const snapshot = await firestore.collection('grupos').get();
        grupos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }else{
        const snapshot = await firestore.collection('grupos').where('coordinador', '==', req.user.id).get();
        grupos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
	if(grupos.length>0){
		// Get unique ids from parroquias and capillas
		var pid = Array.from(new Set(grupos.map(a=>(a.parroquia || null)))).filter(a=>a!=null);
		var cid = Array.from(new Set(grupos.map(a=>(a.capilla || null)))).filter(a=>a!=null);
		
		// Get parroquias
		var parroquias = [];
		if(pid.length>0){
			var snapParroquias = await firestore.getAll(...pid.map(a=>firestore.doc('parroquias/'+a)));
			snapParroquias.forEach(a=>{
				if(!a.exists) return;
				var d = a.data();
				parroquias.push({ id: a.id, nombre: d.nombre });
			})
		}

		// Get capillas
		var capillas = []
		if(cid.length>0){
			var snapCapillas = await firestore.getAll(...cid.map(a=>firestore.doc('capillas/'+a)));
			snapCapillas.forEach(a=>{
				if(!a.exists) return;
				var d = a.data();
				capillas.push({ id: a.id, nombre: d.nombre });
			})
		}

		for(var i of grupos){
			if(i.parroquia){
				i.parroquia = parroquias.find(a=>a.id==i.parroquia);
			}else if(i.capilla){
				i.capilla = capillas.find(a=>a.id==i.capilla);
			}
		}
	}
    res.send({
        error: false, 
        data: grupos
    })
}

const getone = async (firestore, req, res)=>{
    try{
        var snapshot = await firestore.collection('grupos').doc(req.params.id).get();
        if (!snapshot.exists){
            return res.send({
                error: true, 
                message: 'there is no group with that id'
            })
        }

        var grupo = snapshot.data();
        if(!req.user.admin && grupo.coordinador!=req.user.id){
            return res.send({
                error: true,
                code: 999,
                message: 'No tienes acceso a este grupo'
            })
        }
    
        // Query a información de los miembros
        var miembrosSnap = await firestore.collection('miembros').where('grupo', '==', snapshot.id).where('estatus', '==', 0).get();
        var miembros = []
        miembrosSnap.forEach(a=>{
            if(!a.exists) return;
            miembros.push({ id: a.id, nombre: a.data().nombre });
        })
        grupo.miembros = miembros;
    
        if(grupo.parroquia){
            // Grupo pertenece a parroquia, query a parroquia.
            var parrSnap = await firestore.collection('parroquias').doc(grupo.parroquia).get();
            if(parrSnap.exists){
                grupo.parroquia = { id: parrSnap.id, nombre: parrSnap.data().nombre };
            }else grupo.parroquia = false;
        }else if(grupo.capilla){
            // Grupo pertenece a capilla, query a capilla y su parroquia.
            var capSnap = await firestore.collection('capillas').doc(grupo.capilla).get();
            if(capSnap.exists){
                grupo.capilla = { id: capSnap.id, nombre: capSnap.data().nombre };
                var parrSnap = await firestore.collection('parroquias').where('capillas', 'array-contains', capSnap.id).select('nombre').get();
                if(parrSnap.size>0){
                    grupo.capilla.parroquia = { id: parrSnap.docs[0].id, nombre: parrSnap.docs[0].data().nombre };
                }
            }else grupo.capilla = false;
        }
        
        if(grupo.coordinador){
            var coordSnap = await firestore.collection('coordinadores').doc(grupo.coordinador).get();
            if(!coordSnap.exists) grupo.coordinador = null;
            grupo.coordinador = {
                id: coordSnap.id,
                nombre: coordSnap.data().nombre
            }
        }

        // Conseguir información sobre asistencias
        const asistenciasSnap = await firestore.collection('grupos/'+req.params.id+'/asistencias').get();
        var asistencias = asistenciasSnap.docs.map(doc=>doc.id);
        grupo.asistencias = (asistencias || []);

        res.send({
            error: false, 
            data: grupo
        })
    }catch(err){
        console.log(err);
        return res.send({
            error: true,
            message: 'Error inesperado.'
        })
    }
}

var getBajasTemporales = async (firestore, req, res)=>{
    var { id } = req.params;
    try{
        var snapshot = await firestore.collection('grupos').doc(id).get();
        if (!snapshot.exists){
            return res.send({
                error: true, 
                message: 'there is no group with that id'
            })
        }
    
        // Query a información de los miembros
        var miembrosSnap = await firestore.collection('miembros').where('grupo', '==', snapshot.id).where('estatus', '==', 1).get('nombre');
        var miembros = []
        miembrosSnap.forEach(a=>{
            if(!a.exists) return;
            miembros.push({ id: a.id, nombre: a.data().nombre });
        });
    
        return res.send({
            error: false,
            data: miembros
        })
    }catch(e){
        return res.send({
            error: true,
            message: 'Mensaje inesperado'
        })
    }
}

const add = async (firestore, req, res)=>{
    // Check if has access to add. (Is admin)
    if(!req.user.admin){
        return res.send({
            error: true,
            message: 'No tienes acceso a esta accion'
        })
    }


    var { name, parroquia, capilla, coordinador } = req.body;
    try{ 
        const snapshot = await firestore.collection('coordinadores').doc(coordinador).get() 
        if(!snapshot.exists || !snapshot.data().coordinador) throw {message: 'no hay coordinador registrado con ese id'}
        if ((!parroquia && !capilla)|| (parroquia && capilla)) throw {message: 'group needs capilla OR parroquia'}
    } 
    catch(err){
        return res.send({
            error: true, 
            message: err.message
        })
    }

    //validate parroquia
    if (parroquia){
        const snapshot = await firestore.collection('parroquias').doc(parroquia).get()
        if (!snapshot.exists){
            return res.send({
                error: true, 
                message: 'no hay parroquia con ese id'
            })
        }
    }
    //validate capilla
    if(capilla){
        const snapshot = await firestore.collection('capillas').doc(capilla).get()
        if(!snapshot.exists){
            return res.send({
                error: true, 
                message: 'no hay capilla con ese id'
            })
        }
    }
    let newGroup = {
        nombre: name,
        coordinador
    }
    if (capilla)
        newGroup.capilla = capilla

    if (parroquia)
        newGroup.parroquia = parroquia

    const docref = await firestore.collection('grupos').add(newGroup)
    newGroup.id = docref.id;
    res.send({
        error: false, 
        data: newGroup
    })
}

const edit = async (firestore, req, res)=>{
    var {
        id,
        nombre,
        parroquia,
        capilla
    } = req.body;

    var data = { nombre };
    if(capilla) data.capilla = capilla;
    else data.parroquia = parroquia;

    // CHECK IF HAS ACCESS
    try{
        // Checar si tiene acceso a editar el grupo
        if(!req.user.admin){ // Checar si no es admin
            var grupoSnap = await firestore.collection('grupos').doc(id)
            var grupo = grupoSnap.get();
            if(!grupo.exists) return res.send({ error: true, message: 'Grupo no existe.' });

            // Checar si el grupo pertenece al usuario.
            if(grupo.data().coordinador!=req.user.id){
                return res.send({ error: true, message: 'No tienes acceso a este grupo.' });
            }
        }
    }catch(e){
        return res.send({
            error: true,
            message: 'Error inesperado.'
        })
    }

    // DO UPDATE
    try{
        await firestore.collection('grupos').doc(id).update(data);
        return res.send({
            error: false,
            data: true
        })
    }catch(err){
        return res.send({
            error: true,
            message: 'Error inesperado.'
        })
    }
}

const remove = async (firestore, req, res)=>{
    var { id } = req.params;
    try{
        var grupoSnap = await firestore.collection('grupos').doc(id)
        // Checar si tiene acceso a editar el grupo
        if(!req.user.admin){ // Checar si no es admin
            var grupo = grupoSnap.get();
            if(!grupo.exists) return res.send({ error: true, message: 'Grupo no existe.' });

            // Checar si el grupo pertenece al usuario.
            if(grupo.data().coordinador!=req.user.id){
                return res.send({ error: true, message: 'No tienes acceso a este grupo.' });
            }
        }
        
        // Eliminar miembros
        let batch = firestore.batch();
        const memberSnap = await firestore.collection('miembros').where('grupo', '==', id).get();
        memberSnap.docs.forEach(doc=>{
            batch.delete(doc.ref);
        });
        await batch.commit();

        // Eliminar grupo
        await grupoSnap.delete();

        return res.send({
            error: false,
            data: true 
        });
    }catch(e){
        return res.send({
            error: true,
            message: 'Error inesperado.'
        })
    }
}

const changeCoordinador = async (firestore, req, res)=>{
    var { id } = req.params;
    var { coordinador } = req.body;
    try{
        var grupoSnap = await firestore.collection('grupos').doc(id)
        // Checar si tiene acceso a editar el grupo
        if(!req.user.admin){ // Checar si no es admin
            var grupo = grupoSnap.get();
            if(!grupo.exists) return res.send({ error: true, message: 'Grupo no existe.' });

            // Checar si el grupo pertenece al usuario.
            if(req.user.tipo=='coordinador'){
                if(grupo.data().coordinador!=req.user.id){
                    return res.send({ error: true, message: 'No tienes acceso a este grupo.' });
                }
            }else if(req.user.tipo=='acompañante_decanato' || req.user.tipo=='acompañante_zona'){
                return res.send({ error: true, message: 'No tienes acceso a este grupo.' });
                // var parroquiaSnap = await firestore.collection('parroquia').doc(grupo.data().parroquia).get()
                // if(!parroquiaSnap.exists) return res.send({ error: true, message: 'No tienes acceso a este grupo.' });
                // if(req.user.tipo=='acompañante_decanato'){
                //     if(parroquiaSnap)
                // }
            }
        }
       
        const coordSnap = await firestore.collection('miembros').doc(coordinador).get();
        if(!coordSnap.exists || !coordSnap.data().coordinador) return res.send({ error: true, message: 'El coordinador no existe.' });
        
        await grupoSnap.update({ coordinador });

        return res.send({
            error: false,
            data: true 
        });
    }catch(e){
        return res.send({
            error: true,
            message: 'Error inesperado.'
        })
    }
}

const addMember = async (firestore, req, res)=>{
    var {
        grupo,
        nombre,
        apellido_paterno,
        apellido_materno,
        estado_civil,
        sexo,
        email,
        fecha_nacimiento,
        escolaridad,
        oficio,
        domicilio
    } = req.body;

    var fn = moment(fecha_nacimiento, 'YYYY-MM-DD');
    if(!fn.isValid()) fn = moment();

    try{
        var groupSnap = await firestore.collection('grupos').doc(grupo).get();
        if(!groupSnap.exists) return res.send({ error: true, message: 'Grupo no existe.', code: 1 });
        
        if(!req.user.admin && req.user.id!=groupSnap.data().coordinador){
            return res.send({
                error: true,
                code: 999,
                message: 'No tienes acceso a esta acción'
            })
        }

        var new_member = {
            nombre,
            apellido_paterno,
            apellido_materno,
            fecha_nacimiento: fn,
            sexo,
            estado_civil,
            email,
            escolaridad,
            oficio,
            domicilio,
            grupo,
            estatus: 0, // 0 = Activo, 1 = Baja Temporal, 2 = Baja definitiva
        }
        var memberRef = await firestore.collection('miembros').add(new_member);
        new_member.id = memberRef.id;
        // await firestore.collection("grupos").doc(grupo).update({
        //     miembros: [...groupSnap.get('miembros'), new_member.id]
        // });

        return res.send({
            error: false,
            data: new_member
        })
    }catch(err){
        console.log(err);
        return res.send({
            error: true, 
            message: 'Error inesperado.'
        })
    }
}

const getMember = async (firestore, req, res) => {
    var id = req.params.id;
    try {
        var memberSnap = await firestore.collection('miembros').doc(id).get();
        if (!memberSnap.exists) return res.send({ error: true, message: 'Miembro no existe.', code: 1 });
        var member = memberSnap.data();
        return res.send({
            error: false,
            data: member
        })
    } catch (err) {
        console.log(err);
        return res.send({
            error: true,
            message: 'Error inesperado.'
        })
    }
}

const getMemberFicha = async (firestore, req, res) => {
    var id = req.params.id;
    try {
        var seguroSnap = await firestore.collection('miembros').doc(id).collection('ficha medica').doc('seguro').get();
        var historialSnap = await firestore.collection('miembros').doc(id).collection('ficha medica').doc('historial').get();
        if (!historialSnap.exists || !seguroSnap.exists)
            return res.send({ error: true, message: 'Miembro no existe o no tiene ficha medica', code: 1 });

        var alergiasSnap = await firestore.collection('miembros').doc(id).collection('ficha medica').doc('historial').collection('alergias').get();
        var enfermedadesSnap = await firestore.collection('miembros').doc(id).collection('ficha medica').doc('historial').collection('enfermedades').get();
        var tratamientosSnap = await firestore.collection('miembros').doc(id).collection('ficha medica').doc('historial').collection('tratamientos').get();

        var alergias = alergiasSnap.docs.map(doc => ({ id: "alergias", ...doc.data() }));
        var enfermedades = enfermedadesSnap.docs.map(doc => ({ id: "enfermedades", ...doc.data() }));
        var tratamientos = tratamientosSnap.docs.map(doc => ({ id: "tratamientos", ...doc.data() }));


        var seguro = seguroSnap.data;
        return res.send({
            error: false,
            Seguro: seguro,
            Alergias: alergias,
            Enfermedades: enfermedades,
            Tratamientos: tratamientos
        })
    } catch (err) {
        console.log(err);
        return res.send({
            error: true,
            message: 'Error inesperado.'
        })
    }
}

const editMember = async (firestore, req, res) => {
    var id = req.params.id;
    var {
        nombre,
        apellido_paterno,
        apellido_materno,
        estado_civil,
        sexo,
        email,
        fecha_nacimiento,
        escolaridad,
        oficio,
        domicilio
    } = req.body;
    
    
    var fn = moment(fecha_nacimiento, 'YYYY-MM-DD');
    if(!fn.isValid()) fn = moment();

    try{
        var miembroSnap = await firestore.collection('miembros').doc(id).get();
        if(!miembroSnap.exists) return res.send({ error: true, message: 'No existe el miembro' });
        var miembro = miembroSnap.data();

        var groupSnap = await firestore.collection('grupos').doc(miembro.grupo).get();
        if(!groupSnap.exists) return res.send({ error: true, message: 'El grupo no existe' });

        if(!req.user.admin && req.user.id!=groupSnap.data().coordinador){
            return res.send({
                error: true,
                code: 999,
                message: 'No tienes acceso a esta acción'
            })
        }
        await firestore.collection('miembros').doc(id).update({
            nombre,
            apellido_paterno,
            apellido_materno,
            estado_civil,
            sexo,
            email,
            fecha_nacimiento: fn,
            escolaridad,
            oficio,
            domicilio
        });
        return res.send({
            error: false,
            data: true
        })
    }catch(e){
        return res.send({
            error: true,
            message: 'Error inesperado'
        })
    }
}

const editMemberGroup = async (firestore, req, res) => {
	var miembro_id = req.params.id;
    var { grupo_id } = req.body;
    try {
        var groupSnap = await firestore.collection('grupos').doc(grupo_id).get('miembros');
        if (!groupSnap.exists) return res.send({ error: true, message: 'Grupo no existe.', code: 1 });
        var memberSnap = await firestore.collection('miembros').doc(miembro_id).get('nombre');
        if (!memberSnap.exists) return res.send({ error: true, message: 'Miembro no existe.', code: 1 });
        await firestore.collection('miembros').doc(miembro_id).update({ grupo: grupo_id });
        return res.send({
            error: false,
            data: req.body
        })
    } catch (err) {
        console.log(err);
        return res.send({
            error: true,
            message: 'Error inesperado.'
        })
    }
}

const editMemberStatus = async (firestore, req, res) => {
	var id = req.params.id;
    var { status } = req.body;
    try {
        var miembroSnap = await firestore.collection('miembros').doc(id).get();
        if(!miembroSnap.exists) return res.send({ error: true, message: 'No existe el miembro' });
        var miembro = miembroSnap.data();

        var groupSnap = await firestore.collection('grupos').doc(miembro.grupo).get();
        if(!groupSnap.exists) return res.send({ error: true, message: 'El grupo no existe' });

        if(!req.user.admin && req.user.id!=groupSnap.data().coordinador){
            return res.send({
                error: true,
                code: 999,
                message: 'No tienes acceso a esta acción'
            })
        }

        await firestore.collection('miembros').doc(id).update({ estatus: status });
        return res.send({
            error: false,
            data: true
        })
    } catch (err) {
        console.log(err);
        return res.send({
            error: true,
            message: 'Error inesperado.'
        })
    }
}

const getAsistencia = async (firestore, req, res)=>{
	var {id, fecha} = req.params;
	try{
		var assist = await firestore.collection('grupos/'+id+'/asistencias').doc(fecha).get();
		if(!assist.exists){
			return res.send({
				error: true,
				code: 34, // Arbitrary number
				message: 'No such assistance'
			});
		}
		var groupSnap = await firestore.collection('grupos').doc(id).get();
		if(!groupSnap.exists) return res.send({ error: true, message: 'Grupo no existe.', code: 1 });

		var asistentes = assist.get('miembros');
		var miembros = []
		const asistSnap = await firestore.getAll(...asistentes.map(a=>firestore.doc('miembros/'+a)));
		asistSnap.forEach(a=>{
			if(a.exists) miembros.push({ id: a.id, nombre: a.data().nombre, assist: assist.get('miembros').findIndex(b=>b==a.id)!=-1 })
		});

		var miembrosSnap = await firestore.collection('miembros').where('grupo', '==', groupSnap.id).where('estatus', '==', 0).get();
		miembrosSnap.forEach(a=>{
			if(!a.exists) return;
			if(asistentes.findIndex(b=>b==a.id)!=-1) return;
			miembros.push({ id: a.id, nombre: a.data().nombre, assist: false });
		})

		return res.send({
			error: false,
			data: { miembros } 
		})

	}catch(err){
		console.error(err);
		return res.send({
			error: true,
			message: 'Error inesperado.'
		})
	}
}

const registerAsistencia = async (firestore, req, res)=>{
	var id = req.params.id;
	var { fecha, miembros, force } = req.body;

	var date = moment(fecha, 'YYYY-MM-DD');
	if(!date.isValid()){
		return res.send({ error: true, message: 'Invalid date'})
	}

	var group = await firestore.collection('grupos').doc(id).get();
	if(!group.exists){
		return res.send({
			error: true,
			message: 'Group doesnt exist'
		})
	}

	if(!force){
		var oldAssistance = await await firestore.collection('grupos/'+id+'/asistencias').doc(fecha).get();
		if(oldAssistance.exists){
			return res.send({ 
				error: true,
				code: 52, // Arbitrary number
				message: 'Assistance of that date already exists.'
			})
		}
	}

	try{
		await firestore.collection('grupos/'+id+'/asistencias').doc(date.format('YYYY-MM-DD')).set({ miembros });
		return res.send({
			error: false,
			data: date.format('YYYY-MM-DD')
		});
	}catch(err){
		return res.send({
			error: true,
			message: 'Error inesperado.'
		})
	}
}

const saveAsistencia = async (firestore, req, res)=>{
	var {id, fecha} = req.params;
	var { miembros } = req.body;

	var date = moment(fecha, 'YYYY-MM-DD');
	if(!date.isValid()){
		return res.send({ error: true, message: 'Invalid date'})
	}

	try{
		if(!miembros || miembros.length==0){
			await firestore.collection('grupos/'+id+'/asistencias').doc(date.format('YYYY-MM-DD')).delete();
			return res.send({
				error: false,
				data: { deleted: true, date: date.format('YYYY-MM-DD') }
			})
		}else{
			await firestore.collection('grupos/'+id+'/asistencias').doc(date.format('YYYY-MM-DD')).set({ miembros });
			return res.send({
				error: false,
				data: { deleted: false, date: date.format('YYYY-MM-DD') }
			})
		}
	}catch(e){
		console.error(e);
		return res.send({
			error: true,
			message: 'Unexpected error.'
		})
	}
}

module.exports = {
    getall, 
    getone, 
    edit,
    add,
    remove,
    addMember,
    editMember,
    editMemberGroup,
    editMemberStatus,
    getMember,
    getMemberFicha,
    getAsistencia,
    registerAsistencia,
    saveAsistencia,
    changeCoordinador,
    getBajasTemporales
}